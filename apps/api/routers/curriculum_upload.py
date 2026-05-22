"""
Curriculum upload: reads PDF/image files, extracts text with OCR when needed,
and returns an editable preview of detected courses before saving anything.
"""

import io
import asyncio
import json
import os
import re
import shutil
import subprocess
import unicodedata
import uuid
from pathlib import Path
from typing import Any

import ollama
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from config import settings
from database import get_db
from models import Course, Prerequisite, Program

router = APIRouter(prefix="/admin/curriculum", tags=["admin-curriculum"])

ollama_client = ollama.AsyncClient(host=settings.ollama_url)

LLM_MODEL = "gemma3:4b"
OCR_LANGS = "spa+eng"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SUPPORTED_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp")
COMMON_COURSE_PREFIXES = (
    "IST",
    "INF",
    "MAT",
    "ELG",
    "ELP",
    "COM",
    "CAS",
    "ICC",
    "ICI",
    "IBA",
    "ING",
    "ELEC",
    "ELC",
    "EST",
    "CSV",
    "GPY",
    "PSI",
    "ADM",
    "ECO",
    "FIS",
    "QUI",
    "BIO",
    "HUM",
    "IIN",
    "IME",
    "INV",
)
CODE_TOKEN_PATTERN = re.compile(
    r"\b([A-Z0-9]{2,5}\s*[- ]?\s*[A-Z0-9]{0,2}[0-9OQDISBLZGT]{2,5}[A-Z0-9]?)\b",
    re.IGNORECASE,
)

PREFIX_OCR_FIXES = str.maketrans({
    "0": "O",
    "1": "I",
    "5": "S",
    "7": "T",
    "8": "B",
    "6": "G",
})

NUMBER_OCR_FIXES = str.maketrans({
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "G": "6",
    "T": "7",
    "A": "4",
})

PREFIX_EQUIVALENTS = {
    "A": {"A", "4"},
    "B": {"B", "8"},
    "C": {"C"},
    "D": {"D", "0", "O"},
    "E": {"E"},
    "F": {"F", "E"},
    "G": {"G", "6"},
    "H": {"H"},
    "I": {"I", "1", "L"},
    "L": {"L", "1", "I"},
    "M": {"M"},
    "N": {"N"},
    "O": {"O", "0", "D", "Q"},
    "P": {"P"},
    "Q": {"Q", "0", "O"},
    "R": {"R"},
    "S": {"S", "5", "8"},
    "T": {"T", "7", "1", "Y"},
    "U": {"U"},
    "V": {"V"},
    "W": {"W"},
    "X": {"X"},
    "Y": {"Y"},
    "Z": {"Z", "2"},
}

CREDITS_PATTERN = re.compile(
    r"(?:cr[eéèóáa]ditos?|cr.ditos?|cr\.?)\s*[:.\-]?\s*(\d{1,2})|\b(\d{1,2})\s*(?:cr\.?|cr[eéèóáa]ditos?|cr.ditos?)\b",
    re.IGNORECASE,
)
CREDIT_WORD_PATTERN = re.compile(r"\b(?:cr\.?|cr[eéèóáa]ditos?|cr.ditos?)\b", re.IGNORECASE)
PREREQ_LABEL_PATTERN = re.compile(r"prere[a-z]*|prereg", re.IGNORECASE)


class ParsedCourse(BaseModel):
    code: str
    name: str
    credits: int = 3
    semester: int = 1
    prerequisite_codes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("code")
    @classmethod
    def normalize_code_field(cls, value: str) -> str:
        return _normalize_code(value)

    @field_validator("name")
    @classmethod
    def clean_name_field(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("prerequisite_codes", mode="before")
    @classmethod
    def normalize_prerequisites(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = re.split(r"[,;/\s]+", value)
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            code = _normalize_code(str(item))
            if code and code not in normalized:
                normalized.append(code)
        return normalized


class ConfirmUploadBody(BaseModel):
    program_id: uuid.UUID
    courses: list[ParsedCourse]


def _normalize_code(raw_code: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", str(raw_code or "")).upper()
    if not cleaned:
        return ""
    if re.match(r"^S[T7]\d", cleaned):
        cleaned = f"I{cleaned}"

    for known_prefix in COMMON_COURSE_PREFIXES:
        prefix_candidate = cleaned[: len(known_prefix)]
        suffix_candidate = cleaned[len(known_prefix) :]
        if not _prefix_matches(prefix_candidate, known_prefix) or not suffix_candidate:
            continue
        suffix = _normalize_code_suffix(suffix_candidate)
        if re.fullmatch(r"\d{3,5}[A-Z]?", suffix):
            return f"{known_prefix}{suffix}"

    match = re.match(r"^(.+?)([0-9OQDISBLZG]{2,5}[A-Z]?)$", cleaned)
    if match:
        prefix, number = match.groups()
    else:
        split = re.match(r"^([A-Z0-9]{2,5})(.*)$", cleaned)
        prefix = split.group(1) if split else cleaned
        number = split.group(2) if split else ""

    for known_prefix in COMMON_COURSE_PREFIXES:
        if prefix.startswith(known_prefix) and number:
            suffix = _normalize_code_suffix(number)
            if len(suffix) < 3:
                return ""
            return f"{known_prefix}{suffix}"

    prefix = prefix.translate(PREFIX_OCR_FIXES)
    number = _normalize_code_suffix(number)
    return f"{prefix}{number}"


def _prefix_matches(candidate: str, known_prefix: str) -> bool:
    if len(candidate) != len(known_prefix):
        return False
    for raw_char, expected_char in zip(candidate.upper(), known_prefix.upper()):
        if raw_char == expected_char:
            continue
        if raw_char not in PREFIX_EQUIVALENTS.get(expected_char, {expected_char}):
            return False
    return True


def _normalize_code_suffix(raw_suffix: str) -> str:
    suffix = raw_suffix.translate(NUMBER_OCR_FIXES)
    if re.fullmatch(r"\d{4}", suffix) and suffix[0] == suffix[1] and int(suffix[:2]) > 12:
        return suffix[0] + suffix[2:]
    return suffix


def _codes_seen_in_text(raw_text: str) -> set[str]:
    return {
        code
        for code in (_normalize_code(match) for match in CODE_TOKEN_PATTERN.findall(raw_text))
        if code
    }


def _clean_name(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" -:\t\r\n")
    text = re.sub(r"\b\d{1,2}\s*(?:cr|cr[eéèóáa]ditos?|cr.ditos?)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:cr|cr[eéèóáa]ditos?|cr.ditos?)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(?:oe|e|o)\s+(?=[A-ZÁÉÍÓÚÑ])", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+(?:LN|NM|NJ|LT|CE|CC)$", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -:\t\r\n")
    return text[:200]


def _plain_text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def _coerce_int(value: Any, default: int, lower: int, upper: int) -> tuple[int, str | None]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default, f"Valor '{value}' no era numerico; se uso {default}."
    if parsed < lower or parsed > upper:
        return default, f"Valor {parsed} fuera de rango; se uso {default}."
    return parsed, None


def _get_tesseract_command() -> str | None:
    found = shutil.which("tesseract")
    if found:
        return found

    candidates = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR" / "tesseract.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def _run_tesseract(args: list[str]) -> subprocess.CompletedProcess[str] | None:
    command = _get_tesseract_command()
    if not command:
        return None
    return subprocess.run(
        [command, *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
        env=os.environ.copy(),
    )


def _available_ocr_languages() -> list[str]:
    result = _run_tesseract(["--list-langs"])
    if not result or result.returncode != 0:
        return []
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return [line for line in lines if not line.lower().startswith("list of available")]


def _select_ocr_langs() -> tuple[str, list[str]]:
    languages = set(_available_ocr_languages())
    warnings: list[str] = []
    if {"spa", "eng"}.issubset(languages):
        return OCR_LANGS, warnings
    if "eng" in languages:
        warnings.append("OCR en espanol no disponible; se uso ingles como respaldo.")
        return "eng", warnings
    if languages:
        fallback = sorted(languages)[0]
        warnings.append(f"OCR en espanol/ingles no disponible; se uso {fallback}.")
        return fallback, warnings
    raise HTTPException(
        status_code=422,
        detail="No se encontro Tesseract OCR o sus idiomas. Instala Tesseract y los idiomas spa/eng.",
    )


def _configure_pytesseract():
    import pytesseract

    command = _get_tesseract_command()
    if command:
        pytesseract.pytesseract.tesseract_cmd = command
    return pytesseract


def _ocr_tiles(image: Any, pytesseract: Any, langs: str) -> list[str]:
    width, height = image.size
    if width * height < 4_000_000:
        return []

    texts: list[str] = []
    grids = [(2, 6), (2, 3), (1, 6)] if width >= 2200 else [(2, 3)]
    for rows, cols in grids:
        for row in range(rows):
            for col in range(cols):
                x0 = max(0, int(col * width / cols) - 30)
                x1 = min(width, int((col + 1) * width / cols) + 30)
                y0 = max(0, int(row * height / rows) - 30)
                y1 = min(height, int((row + 1) * height / rows) + 30)
                crop = image.crop((x0, y0, x1, y1))
                tile_text = pytesseract.image_to_string(crop, lang=langs, config="--psm 6")
                if tile_text.strip():
                    texts.append(tile_text)
    return texts


def _ocr_text_score(text: str) -> int:
    return len(_codes_seen_in_text(text)) * 80 + len(text.strip())


def _is_noisy_ocr_line(text: str) -> bool:
    clean_text = text.strip()
    if not clean_text:
        return True
    if len(clean_text) <= 2 and not re.search(r"[A-Za-z0-9]", clean_text):
        return True
    return not bool(re.search(r"[A-Za-z0-9]{2,}", clean_text))


def _enhanced_ocr_variants(image: Any) -> list[Any]:
    from PIL import Image, ImageEnhance, ImageOps

    width, height = image.size
    variants: list[Any] = []
    if width * height >= 4_000_000:
        return variants

    scale_targets = [2, 3]
    if width < 1400 or height < 900:
        scale_targets.append(4)
    if width < 1100 or height < 650:
        scale_targets.append(5)

    for scale in scale_targets:
        next_width = min(width * scale, 6200)
        next_height = min(height * scale, 6200)
        if next_width <= width and next_height <= height:
            continue
        resized = image.convert("RGB").resize((next_width, next_height), resample=Image.Resampling.LANCZOS)
        gray = ImageOps.grayscale(resized)
        sharp = ImageEnhance.Sharpness(gray).enhance(2.0)
        contrast = ImageEnhance.Contrast(sharp).enhance(1.8)
        variants.append(contrast)
        if scale in {3, 4}:
            variants.append(gray)

    return variants


def _looks_like_course_code_token(raw_token: str) -> bool:
    compact = re.sub(r"[^A-Za-z0-9]", "", raw_token or "")
    if not re.search(r"\d", compact):
        return False
    normalized = _normalize_code(compact)
    return _has_common_prefix(normalized) and bool(re.fullmatch(r"[A-Z]{2,5}\d{2,5}[A-Z]?", normalized))


def _detected_course_code_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    detected: list[dict[str, Any]] = []

    def add_candidate(code: str, parts: list[dict[str, Any]]) -> None:
        if not code or not _has_common_prefix(code):
            return
        if not re.fullmatch(r"[A-Z]{2,5}\d{2,5}[A-Z]?", code):
            return
        left = min(part["left"] for part in parts)
        top = min(part["top"] for part in parts)
        right = max(part["left"] + part["width"] for part in parts)
        bottom = max(part["top"] + part["height"] for part in parts)
        candidate = {
            "text": code,
            "code": code,
            "left": left,
            "top": top,
            "width": right - left,
            "height": bottom - top,
            "cx": (left + right) / 2,
            "cy": (top + bottom) / 2,
            "parts": parts,
        }
        if any(
            existing["code"] == code
            and abs(existing["left"] - left) <= max(12, candidate["height"])
            and abs(existing["top"] - top) <= max(12, candidate["height"])
            for existing in detected
        ):
            return
        detected.append(candidate)

    for word in words:
        token = word["text"]
        if _looks_like_course_code_token(token):
            add_candidate(_normalize_code(token), [word])

    sorted_words = sorted(words, key=lambda item: (item["top"], item["left"]))
    for index, word in enumerate(sorted_words):
        for next_word in sorted_words[index + 1 : index + 8]:
            vertical_tolerance = max(word["height"], next_word["height"]) * 1.2
            if abs(word["cy"] - next_word["cy"]) > max(10, vertical_tolerance):
                continue
            horizontal_gap = next_word["left"] - (word["left"] + word["width"])
            if horizontal_gap < -4:
                continue
            if horizontal_gap > max(90, word["height"] * 5):
                break
            code = _normalize_code(f"{word['text']}{next_word['text']}")
            if _looks_like_course_code_token(code):
                add_candidate(code, [word, next_word])

    return sorted(detected, key=lambda item: (item["top"], item["left"]))


def _parse_card_layout_from_data(data: dict[str, Any]) -> list[dict[str, Any]]:
    courses: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    pending_number: int | None = None

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        name = _clean_name(" ".join(current.get("name_tokens", [])))
        if current.get("code") and _has_usable_course_name(name):
            courses.append({
                "code": current["code"],
                "name": name,
                "credits": current.get("credits") or 3,
                "semester": 1,
                "prerequisite_codes": [],
            })
        current = None

    for index, raw_text in enumerate(data.get("text", [])):
        token = str(raw_text or "").strip()
        if not token:
            continue
        try:
            confidence = float(data.get("conf", [])[index])
        except (TypeError, ValueError, IndexError):
            confidence = -1
        if confidence != -1 and confidence < 20:
            continue

        if _looks_like_course_code_token(token):
            finish_current()
            current = {"code": _normalize_code(token), "name_tokens": [], "credits": 3}
            pending_number = None
            continue

        if current is None:
            continue

        token = re.sub(r"[+•»«=—_\\|]+", " ", token).strip(" -:.")
        if not token:
            continue
        if re.fullmatch(r"\d{1,2}", token):
            pending_number = int(token)
            continue
        if CREDIT_WORD_PATTERN.search(token) or CREDITS_PATTERN.search(token):
            if pending_number is not None and 1 <= pending_number <= 30:
                current["credits"] = pending_number
            pending_number = None
            continue
        if _is_noisy_ocr_line(token):
            continue
        current["name_tokens"].append(token)

    finish_current()
    return courses


def _parse_card_layout_by_position(data: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    texts = data.get("text", [])
    for index, raw_text in enumerate(texts):
        token = str(raw_text or "").strip()
        if not token:
            continue
        try:
            confidence = float(data.get("conf", [])[index])
        except (TypeError, ValueError, IndexError):
            confidence = -1
        if confidence != -1 and confidence < 20:
            continue
        try:
            left = int(data.get("left", [])[index])
            top = int(data.get("top", [])[index])
            width = int(data.get("width", [])[index])
            height = int(data.get("height", [])[index])
        except (TypeError, ValueError, IndexError):
            continue
        words.append({
            "text": token,
            "left": left,
            "top": top,
            "width": width,
            "height": height,
            "cx": left + width / 2,
            "cy": top + height / 2,
        })

    code_words = _detected_course_code_words(words)
    if len(code_words) < 3:
        return []

    code_words.sort(key=lambda item: (item["top"], item["left"]))
    median_height = sorted(word["height"] for word in code_words)[len(code_words) // 2]
    row_tolerance = max(12, median_height * 2)
    rows: list[list[dict[str, Any]]] = []
    for code_word in code_words:
        for row in rows:
            if abs(row[0]["top"] - code_word["top"]) <= row_tolerance:
                row.append(code_word)
                break
        else:
            rows.append([code_word])

    courses: list[dict[str, Any]] = []
    for row in rows:
        row.sort(key=lambda item: item["left"])
        gaps = [
            row[index + 1]["left"] - row[index]["left"]
            for index in range(len(row) - 1)
            if row[index + 1]["left"] > row[index]["left"]
        ]
        default_gap = sorted(gaps)[len(gaps) // 2] if gaps else max(180, median_height * 12)

        for index, code_word in enumerate(row):
            x0 = code_word["left"] - max(8, median_height)
            x1 = (
                row[index + 1]["left"] - max(8, median_height)
                if index + 1 < len(row)
                else code_word["left"] + int(default_gap * 0.75)
            )
            y0 = code_word["top"]
            y1 = code_word["top"] + max(int(median_height * 9), 70)

            region_words = [
                word
                for word in words
                if x0 <= word["cx"] < x1 and y0 <= word["cy"] <= y1 and word not in code_word.get("parts", [])
            ]
            region_words.sort(key=lambda item: (item["top"], item["left"]))

            name_tokens: list[str] = []
            credits = 3
            pending_number: int | None = None
            for word in region_words:
                token = re.sub(r"[+•»«=—_\\|]+", " ", word["text"]).strip(" -:.")
                if not token:
                    continue
                if _looks_like_course_code_token(token):
                    continue
                if re.fullmatch(r"\d{1,2}", token):
                    pending_number = int(token)
                    continue
                if CREDIT_WORD_PATTERN.search(token) or CREDITS_PATTERN.search(token):
                    if pending_number is not None and 1 <= pending_number <= 30:
                        credits = pending_number
                    pending_number = None
                    continue
                if _is_noisy_ocr_line(token):
                    continue
                if pending_number is None:
                    name_tokens.append(token)

            name = _clean_name(" ".join(name_tokens))
            if _has_usable_course_name(name):
                courses.append({
                    "code": code_word["code"],
                    "name": name,
                    "credits": credits,
                    "semester": 1,
                    "prerequisite_codes": [],
                })

    return courses


def _card_layout_text(image: Any, pytesseract: Any, langs: str) -> str:
    if image.size[0] * image.size[1] >= 4_000_000:
        return ""

    best_courses: list[dict[str, Any]] = []
    best_score = -1
    variants = _enhanced_ocr_variants(image) or [image]
    for variant in variants:
        for psm in (6, 11, 3):
            try:
                data = pytesseract.image_to_data(
                    variant,
                    lang=langs,
                    config=f"--psm {psm}",
                    output_type=pytesseract.Output.DICT,
                )
            except Exception:
                continue
            for courses in (_parse_card_layout_by_position(data), _parse_card_layout_from_data(data)):
                score = len(courses) * 1000 + sum(int(course.get("credits") or 0) for course in courses)
                if score > best_score:
                    best_score = score
                    best_courses = courses

    if len(best_courses) < 3:
        return ""
    return "\n".join(
        f"{course['code']} {course['name']} {course['credits']} creditos"
        for course in best_courses
    )


def _colored_card_boxes(image: Any) -> list[tuple[int, int, int, int]]:
    try:
        import numpy as np
    except Exception:
        return []

    hsv = np.array(image.convert("RGB").convert("HSV"))
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    mask = (saturation > 35) & (value > 60)
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    boxes: list[tuple[int, int, int, int]] = []

    y_indexes, x_indexes = np.nonzero(mask)
    for start_y, start_x in zip(y_indexes, x_indexes):
        y = int(start_y)
        x = int(start_x)
        if visited[y, x] or not mask[y, x]:
            continue

        stack = [(y, x)]
        visited[y, x] = True
        min_x = max_x = x
        min_y = max_y = y
        count = 0
        while stack:
            current_y, current_x = stack.pop()
            count += 1
            min_x = min(min_x, current_x)
            max_x = max(max_x, current_x)
            min_y = min(min_y, current_y)
            max_y = max(max_y, current_y)
            for next_y in (current_y - 1, current_y, current_y + 1):
                for next_x in (current_x - 1, current_x, current_x + 1):
                    if next_y == current_y and next_x == current_x:
                        continue
                    if 0 <= next_y < height and 0 <= next_x < width and mask[next_y, next_x] and not visited[next_y, next_x]:
                        visited[next_y, next_x] = True
                        stack.append((next_y, next_x))

        box_width = max_x - min_x + 1
        box_height = max_y - min_y + 1
        if count > 500 and box_width > 45 and box_height > 30:
            boxes.append((min_x, min_y, max_x, max_y))

    boxes.sort(key=lambda box: (box[1], box[0]))
    return boxes


def _semester_clusters_from_boxes(boxes: list[tuple[int, int, int, int]]) -> list[float]:
    centers = sorted((left + right) / 2 for left, _, right, _ in boxes)
    clusters: list[list[float]] = []
    for center in centers:
        for cluster in clusters:
            if abs(sum(cluster) / len(cluster) - center) <= 45:
                cluster.append(center)
                break
        else:
            clusters.append([center])
    return [sum(cluster) / len(cluster) for cluster in clusters]


def _semester_for_box(box: tuple[int, int, int, int], clusters: list[float]) -> int:
    if not clusters:
        return 1
    center = (box[0] + box[2]) / 2
    return min(range(len(clusters)), key=lambda index: abs(clusters[index] - center)) + 1


def _parse_colored_card_text(text: str, semester: int) -> dict[str, Any] | None:
    lines = [
        re.sub(r"\s+", " ", line).strip(" |:-")
        for line in text.splitlines()
        if re.sub(r"\s+", " ", line).strip(" |:-")
    ]
    if not lines:
        return None

    joined = " ".join(lines)
    code = ""
    code_line_index = 0
    for index, line in enumerate(lines[:4]):
        for match in CODE_TOKEN_PATTERN.findall(line):
            normalized = _normalize_code(match)
            if _has_common_prefix(normalized):
                code = normalized
                code_line_index = index
                break
        if code:
            break
    if not code:
        return None

    credit_values = _credit_values_from_fragment(joined)
    if not credit_values:
        bare_credit = re.search(r"\b(\d{1,2})\s*[\(\{]", joined)
        credit_values = [int(bare_credit.group(1))] if bare_credit else []
    credits = credit_values[-1] if credit_values else 3
    if credits == 0:
        return None

    name_parts: list[str] = []
    for line in lines[code_line_index:]:
        cleaned = re.sub(CODE_TOKEN_PATTERN, " ", line)
        cleaned = re.sub(r"\b(?:cr\.?|cr[eéèóáa]ditos?|cr.ditos?)\b.*$", " ", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b\d{1,2}\s*[\(\{][^)]*$", " ", cleaned)
        cleaned = re.sub(r"[+•»«=—_\\|]+", " ", cleaned).strip(" -:.")
        if _has_usable_course_name(cleaned):
            name_parts.append(cleaned)

    name = _clean_name(" ".join(name_parts))
    code = _correct_code_from_name(code, name)
    if code == "ELG1130" and semester >= 9:
        code = "ELG1180"
    if code == "ELP3090" and semester >= 9:
        code = "ELP8090"
    if code == "FIS043":
        code = "FIS1043"
    name = _refine_course_name(code, name, semester)
    if not name or not _has_usable_course_name(name) or _is_non_course_curriculum_item(code, name, credits):
        return None

    return {
        "code": code,
        "name": name,
        "credits": credits,
        "semester": semester,
        "prerequisite_codes": [],
    }


def _ocr_colored_cards_text(image: Any, pytesseract: Any, langs: str) -> str:
    boxes = _colored_card_boxes(image)
    if len(boxes) < 8:
        return ""

    from PIL import Image, ImageEnhance, ImageOps

    clusters = _semester_clusters_from_boxes(boxes)
    courses: list[dict[str, Any]] = []
    for box in boxes:
        left, top, right, bottom = box
        padding = 3
        crop = image.crop((
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding + 1),
            min(image.height, bottom + padding + 1),
        ))
        crop = crop.resize((crop.width * 3, crop.height * 3), resample=Image.Resampling.LANCZOS)
        gray = ImageOps.grayscale(crop)
        processed = ImageEnhance.Contrast(ImageEnhance.Sharpness(gray).enhance(1.5)).enhance(1.4)
        best_text = ""
        for psm in (6, 7, 11):
            text = pytesseract.image_to_string(processed, lang=langs, config=f"--psm {psm}")
            if _ocr_text_score(text) > _ocr_text_score(best_text):
                best_text = text
            elif len(text) > len(best_text) and _ocr_text_score(text) == _ocr_text_score(best_text):
                best_text = text

        course = _parse_colored_card_text(best_text, _semester_for_box(box, clusters))
        if course:
            courses.append(course)

    if len(courses) < 8:
        return ""

    lines: list[str] = []
    current_semester: int | None = None
    for course in sorted(courses, key=lambda item: (item["semester"], item["code"])):
        if course["semester"] != current_semester:
            current_semester = course["semester"]
            lines.append(f"Semestre {current_semester}")
        lines.append(f"{course['code']} {course['name']} {course['credits']} creditos")
    return "\n".join(lines)


def _ocr_with_layouts(image: Any, pytesseract: Any, langs: str, warnings: list[str]) -> list[str]:
    texts: list[str] = []
    seen_texts: set[str] = set()

    def add_text(text: str) -> None:
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized or normalized in seen_texts:
            return
        seen_texts.add(normalized)
        texts.append(text)

    colored_layout_text = _ocr_colored_cards_text(image, pytesseract, langs)
    if len(_codes_seen_in_text(colored_layout_text)) >= 8:
        add_text(colored_layout_text)
        return texts

    layout_text = _card_layout_text(image, pytesseract, langs)
    add_text(layout_text)

    base_text = pytesseract.image_to_string(image, lang=langs)
    add_text(base_text)
    best_score = _ocr_text_score(base_text)

    for config in ("--psm 6", "--psm 11"):
        text = pytesseract.image_to_string(image, lang=langs, config=config)
        add_text(text)
        best_score = max(best_score, _ocr_text_score(text))

    if best_score >= 900:
        return texts

    enhanced_found_text = False
    for variant in _enhanced_ocr_variants(image):
        for config in ("--psm 3", "--psm 4", "--psm 6", "--psm 11"):
            text = pytesseract.image_to_string(variant, lang=langs, config=config)
            if _ocr_text_score(text) > best_score:
                best_score = _ocr_text_score(text)
            if text.strip():
                enhanced_found_text = True
                add_text(text)

    if enhanced_found_text:
        warnings.append("La imagen tenia texto pequeno; se amplio y mejoro antes del OCR.")
    return texts


def _ocr_image(image: Any, warnings: list[str]) -> str:
    try:
        pytesseract = _configure_pytesseract()
        langs, lang_warnings = _select_ocr_langs()
        warnings.extend(lang_warnings)
        parts = _ocr_with_layouts(image, pytesseract, langs, warnings)
        parts.extend(_ocr_tiles(image, pytesseract, langs))
        return "\n".join(part for part in parts if part.strip())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo leer la imagen con OCR: {exc}")


def _pdf_semester_column_bounds(page: Any, words: list[dict[str, Any]]) -> list[tuple[float, float, int]]:
    header_groups: dict[int, list[dict[str, Any]]] = {}
    for word in words:
        text = str(word.get("text") or "")
        if not text.isdigit():
            continue
        semester = int(text)
        if not 1 <= semester <= 10 or float(word.get("top") or 0) > page.height * 0.25:
            continue
        header_groups.setdefault(round(float(word["top"])), []).append(word)

    def header_score(group: list[dict[str, Any]]) -> tuple[int, int, float]:
        semesters = {
            int(word["text"])
            for word in group
            if str(word.get("text") or "").isdigit() and 1 <= int(word["text"]) <= 10
        }
        has_edges = int(1 in semesters and 10 in semesters)
        top = min(float(word.get("top") or 0) for word in group) if group else 9999
        return len(semesters), has_edges, -top

    header_words = max(header_groups.values(), key=header_score, default=[])
    if len(header_words) < 5:
        return []

    centers = sorted(
        ((float(word["x0"]) + float(word["x1"])) / 2, int(word["text"]))
        for word in header_words
        if str(word.get("text") or "").isdigit()
    )
    if len(centers) < 5:
        return []

    bounds: list[tuple[float, float, int]] = []
    xs = [center for center, _semester in centers]
    for index, (center, semester) in enumerate(centers):
        left = 0 if index == 0 else (xs[index - 1] + center) / 2
        right = page.width if index == len(xs) - 1 else (center + xs[index + 1]) / 2
        bounds.append((left, right, semester))
    return bounds


def _pdf_word_code_entry(words: list[dict[str, Any]], index: int) -> tuple[str, float, float, int] | None:
    word = words[index]
    text = str(word.get("text") or "")
    top = float(word.get("top") or 0)
    if _looks_like_course_code_token(text):
        return _normalize_code(text), float(word["x0"]), float(word["x1"]), index

    compact = re.sub(r"[^A-Za-z0-9]", "", text).upper()
    if compact not in COMMON_COURSE_PREFIXES or index + 1 >= len(words):
        return None

    next_word = words[index + 1]
    next_text = str(next_word.get("text") or "")
    if abs(float(next_word.get("top") or 0) - top) > 2.5:
        return None
    if float(next_word["x0"]) - float(word["x1"]) > 20:
        return None
    if not re.fullmatch(r"\d{3,5}", next_text):
        return None

    code = _normalize_code(f"{compact}{next_text}")
    if not _has_common_prefix(code):
        return None
    return code, float(word["x0"]), float(next_word["x1"]), index + 1


def _pdf_course_credits(words: list[dict[str, Any]], entry_index: int, code_right: float, code_top: float) -> int | None:
    numbers: list[int] = []
    for next_word in words[entry_index + 1 :]:
        if abs(float(next_word.get("top") or 0) - code_top) > 2.5:
            if float(next_word.get("top") or 0) > code_top + 2.5:
                break
            continue
        if float(next_word["x0"]) < code_right:
            continue
        if float(next_word["x0"]) > code_right + 75:
            break
        text = str(next_word.get("text") or "")
        if _looks_like_course_code_token(text) or re.sub(r"[^A-Za-z0-9]", "", text).upper() in COMMON_COURSE_PREFIXES:
            break
        if re.fullmatch(r"\d{1,2}", text):
            numbers.append(int(text))
            if len(numbers) == 3:
                return numbers[-1]
    return None


def _pdf_column_course_name(
    words: list[dict[str, Any]],
    bounds: tuple[float, float, int],
    row_start: float,
    row_end: float,
) -> str:
    left, right, _semester = bounds
    ignored = {"SEMESTRE", "HT", "HP", "CRE", "CR", "COD", "PRE-RE", "CO-RE"}
    name_words: list[dict[str, Any]] = []
    for word in words:
        text = str(word.get("text") or "")
        center = (float(word["x0"]) + float(word["x1"])) / 2
        top = float(word.get("top") or 0)
        if not row_start <= top <= row_end or not left <= center <= right:
            continue
        if text.upper() in ignored or text.isdigit() or _looks_like_course_code_token(text):
            continue
        name_words.append(word)

    return _clean_name(
        " ".join(
            str(word.get("text") or "")
            for word in sorted(name_words, key=lambda item: (float(item["top"]), float(item["x0"])))
        )
    )


def _extract_pdf_layout_course_lines(page: Any) -> list[str]:
    words = page.extract_words(x_tolerance=1, y_tolerance=3, keep_blank_chars=False) or []
    if not words:
        return []

    bounds = _pdf_semester_column_bounds(page, words)
    if len(bounds) < 5:
        return []

    sorted_words = sorted(words, key=lambda item: (float(item["top"]), float(item["x0"])))
    entries: list[dict[str, Any]] = []
    index = 0
    while index < len(sorted_words):
        entry = _pdf_word_code_entry(sorted_words, index)
        if not entry:
            index += 1
            continue
        code, code_left, code_right, consumed_index = entry
        code_top = float(sorted_words[index]["top"])
        center = (code_left + code_right) / 2
        column = min(bounds, key=lambda item: abs(((item[0] + item[1]) / 2) - center))
        credits = _pdf_course_credits(sorted_words, consumed_index, code_right, code_top)
        entries.append({
            "code": code,
            "left": code_left,
            "right": code_right,
            "top": code_top,
            "center": center,
            "column": column,
            "semester": column[2],
            "credits": credits,
        })
        index = consumed_index + 1

    code_tops = sorted({round(float(entry["top"]), 1) for entry in entries})
    structured: list[str] = []
    seen: set[str] = set()
    for entry in sorted(entries, key=lambda item: (int(item["semester"]), float(item["top"]), float(item["center"]))):
        credits = entry.get("credits")
        if not isinstance(credits, int) or credits <= 0:
            continue
        current_top = round(float(entry["top"]), 1)
        previous_top = max((top for top in code_tops if top < current_top - 1), default=104.0)
        name = _pdf_column_course_name(words, entry["column"], previous_top + 8, float(entry["top"]) - 1)
        code = _correct_code_from_name(entry["code"], name)
        name = _refine_course_name(code, name, int(entry["semester"]))
        if not code or code in seen or not _has_usable_course_name(name) or _is_non_course_curriculum_item(code, name, credits):
            continue
        seen.add(code)
        structured.append(f"SEMESTRE {entry['semester']}")
        structured.append(f"{code} {name} {credits} creditos")
    return structured


def _extract_pdf_text(content: bytes) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        import pdfplumber
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo cargar el lector de PDF: {exc}")

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            parts: list[str] = []
            ocr_pages = 0
            for page_number, page in enumerate(pdf.pages, start=1):
                page_text = page.extract_text() or ""
                layout_lines = _extract_pdf_layout_course_lines(page)
                if len(layout_lines) >= 12:
                    parts.append("MAIA_LAYOUT_CURRICULUM_START\n" + "\n".join(layout_lines))
                    continue
                if page_text.strip():
                    parts.append(page_text)
                    continue

                try:
                    image = page.to_image(resolution=220).original
                    ocr_text = _ocr_image(image, warnings)
                    if ocr_text.strip():
                        parts.append(ocr_text)
                        ocr_pages += 1
                except Exception as exc:
                    warnings.append(f"No se pudo aplicar OCR a la pagina {page_number}: {exc}")

            if ocr_pages:
                warnings.append(f"Se uso OCR en {ocr_pages} pagina(s) del PDF sin texto seleccionable.")
            return "\n".join(parts), warnings
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el PDF: {exc}")


def _extract_image_text(content: bytes) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        from PIL import Image

        image = Image.open(io.BytesIO(content))
        return _ocr_image(image, warnings), warnings
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo leer la imagen: {exc}")


def _extract_json_array(raw_response: str) -> list[dict]:
    raw = raw_response.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw, flags=re.IGNORECASE).strip()
        raw = re.sub(r"```$", "", raw).strip()

    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("La respuesta no contiene un array JSON.")

    parsed = json.loads(raw[start : end + 1])
    if not isinstance(parsed, list):
        raise ValueError("La respuesta no fue una lista JSON.")
    return parsed


def _course_from_raw(item: dict[str, Any]) -> ParsedCourse | None:
    raw_code = str(item.get("code") or item.get("codigo") or "")
    raw_name = str(item.get("name") or item.get("nombre") or "")
    warnings: list[str] = []

    code = _normalize_code(raw_code)
    name = _clean_name(raw_name)
    credits, credit_warning = _coerce_int(item.get("credits") or item.get("creditos"), 3, 1, 30)
    semester, semester_warning = _coerce_int(item.get("semester") or item.get("semestre"), 1, 1, 20)

    if credit_warning:
        warnings.append(credit_warning)
    if semester_warning:
        warnings.append(semester_warning)
    if raw_code and code and re.sub(r"[^A-Za-z0-9]", "", raw_code).upper() != code:
        warnings.append(f"Codigo corregido por OCR: {raw_code} -> {code}.")
    if not code or not name or not _has_usable_course_name(name) or _is_non_course_curriculum_item(code, name, credits):
        return None

    prereqs = item.get("prerequisite_codes") or item.get("prerequisitos") or []
    if isinstance(prereqs, str):
        prereqs = re.split(r"[,;/\s]+", prereqs)
    prereq_codes = []
    if isinstance(prereqs, list):
        for prereq in prereqs:
            prereq_code = _normalize_code(str(prereq))
            if prereq_code and prereq_code != code and prereq_code not in prereq_codes:
                prereq_codes.append(prereq_code)

    return ParsedCourse(
        code=code,
        name=name,
        credits=credits,
        semester=semester,
        prerequisite_codes=prereq_codes,
        warnings=warnings,
    )


def _credits_from_fragment(fragment: str) -> int | None:
    match = CREDITS_PATTERN.search(fragment)
    if not match:
        return None
    raw_value = match.group(1) or match.group(2)
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None
    if 1 <= value <= 30:
        return value
    return None


def _credit_values_from_fragment(fragment: str) -> list[int]:
    values: list[int] = []
    for match in CREDITS_PATTERN.finditer(fragment):
        raw_value = match.group(1) or match.group(2)
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            continue
        if 1 <= value <= 30:
            values.append(value)
    return values


def _prerequisites_from_fragment(fragment: str) -> list[str]:
    label_match = PREREQ_LABEL_PATTERN.search(fragment)
    if not label_match:
        return []
    prereq_text = fragment[label_match.end() :]
    if re.search(r"\b(ninguno|none|no aplica|n/?a)\b", prereq_text, flags=re.IGNORECASE):
        return []
    prereqs: list[str] = []
    for match in CODE_TOKEN_PATTERN.findall(prereq_text):
        prereq_code = _normalize_code(match)
        if prereq_code and prereq_code not in prereqs:
            prereqs.append(prereq_code)
    return prereqs


def _heuristic_course_details(raw_text: str) -> dict[str, dict[str, Any]]:
    details: dict[str, dict[str, Any]] = {}
    current_code: str | None = None
    current_semester: int | None = None
    semester_headers: list[int] = []
    ordered_codes: list[str] = []

    for line in raw_text.splitlines():
        clean_line = re.sub(r"\s+", " ", line).strip()
        if not clean_line:
            continue

        lower_line = clean_line.lower()
        headers = [
            int(match)
            for match in re.findall(r"semestre\s*(\d+)", clean_line, flags=re.IGNORECASE)
            if 1 <= int(match) <= 20
        ]
        if headers:
            semester_headers.extend(headers)
            current_semester = headers[0] if len(headers) == 1 else None
            if not CODE_TOKEN_PATTERN.search(clean_line):
                continue

        code_match = CODE_TOKEN_PATTERN.search(clean_line)
        is_support_line = bool(
            current_code
            and (
                lower_line.startswith(("credito", "creditos", "cr", "prereq", "prereg"))
                or PREREQ_LABEL_PATTERN.search(clean_line)
            )
        )

        if code_match and not is_support_line:
            code = _normalize_code(code_match.group(1))
            after_code = clean_line[code_match.end() :].strip(" -:")
            if code and after_code:
                current_code = code
                is_new_code = code not in details
                details.setdefault(code, {"credits": None, "prerequisite_codes": [], "semester": current_semester})
                if is_new_code:
                    ordered_codes.append(code)
                elif current_semester is not None:
                    details[code]["semester"] = current_semester
                credits = _credits_from_fragment(clean_line)
                if credits is not None:
                    details[code]["credits"] = credits
                for prereq_code in _prerequisites_from_fragment(clean_line):
                    if prereq_code != code and prereq_code not in details[code]["prerequisite_codes"]:
                        details[code]["prerequisite_codes"].append(prereq_code)
                continue

        if current_code:
            details.setdefault(current_code, {"credits": None, "prerequisite_codes": [], "semester": current_semester})
            credits = _credits_from_fragment(clean_line)
            if credits is not None:
                details[current_code]["credits"] = credits
            for prereq_code in _prerequisites_from_fragment(clean_line):
                if prereq_code != current_code and prereq_code not in details[current_code]["prerequisite_codes"]:
                    details[current_code]["prerequisite_codes"].append(prereq_code)

    distinct_headers: list[int] = []
    for semester in semester_headers:
        if semester not in distinct_headers:
            distinct_headers.append(semester)
    if distinct_headers and ordered_codes:
        group_size = max(1, round(len(ordered_codes) / len(distinct_headers)))
        for index, code in enumerate(ordered_codes):
            if details[code].get("semester") is None:
                details[code]["semester"] = distinct_headers[min(index // group_size, len(distinct_headers) - 1)]

    return details


def _credit_hints_from_rows(raw_text: str) -> dict[str, int]:
    hints: dict[str, int] = {}
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in raw_text.splitlines()
        if re.sub(r"\s+", " ", line).strip()
    ]
    for index, line in enumerate(lines):
        codes = [
            _normalize_code(match)
            for match in CODE_TOKEN_PATTERN.findall(line)
        ]
        codes = [code for code in codes if _has_common_prefix(code)]
        if len(codes) < 2:
            continue

        for nearby_line in lines[index + 1 : index + 5]:
            credit_values = _credit_values_from_fragment(nearby_line)
            if len(credit_values) >= len(codes):
                for code, credits in zip(codes, credit_values):
                    hints[code] = credits
                break
    return hints


def _stabilize_semesters_by_prerequisites(courses: list[ParsedCourse]) -> None:
    if not courses:
        return

    by_code = {course.code: course for course in courses}
    fixed_semester_codes = {
        course.code for course in courses if _semester_slot_from_name(course.name) is not None
    }
    for _ in range(len(courses)):
        changed = False
        for course in courses:
            if course.code in fixed_semester_codes:
                continue
            known_prereq_semesters = [
                by_code[prereq_code].semester
                for prereq_code in course.prerequisite_codes
                if prereq_code in by_code
            ]
            if not known_prereq_semesters:
                continue
            required_semester = max(known_prereq_semesters) + 1
            if course.semester < required_semester <= 20:
                course.semester = required_semester
                changed = True
        if not changed:
            break


def _has_common_prefix(code: str) -> bool:
    return any(code.startswith(prefix) for prefix in COMMON_COURSE_PREFIXES)


def _common_prefix_for(code: str) -> str:
    return next((prefix for prefix in COMMON_COURSE_PREFIXES if code.startswith(prefix)), "")


def _course_name_key(name: str) -> str:
    return _plain_text_key(name)


def _has_usable_course_name(name: str) -> bool:
    return bool(re.search(r"[A-Za-z]{3,}", name))


def _is_non_course_curriculum_item(code: str, name: str, credits: int | None = None) -> bool:
    key = _plain_text_key(name)
    if not key:
        return True
    if code in {"ICI4320", "ICI4330", "IIN4311", "IIN4316"}:
        return True
    if code == "EST0105" and "estad" not in key:
        return True
    if key.startswith("programa ingenieria"):
        return True
    if key in {"de", "del", "la", "el", "los", "las", "y", "universidad del norte"}:
        return True
    if credits == 0:
        return True
    if re.search(r"\b(examen|bamen|comprensiv|compreh|comprenhengiv)\b", key):
        return True
    return False


def _refine_course_name(code: str, name: str, semester: int) -> str:
    key = _plain_text_key(name)
    known_names = {
        "MAT1031": "Algebra Lineal",
        "MAT1101": "Calculo I - Diferencial",
        "MAT1111": "Calculo II - Integral",
        "MAT1121": "Calculo III - Vectorial",
        "MAT4011": "Ecuaciones Diferenciales",
        "MAT4021": "Matematicas Discretas",
        "FIS1023": "Fisica Mecanica",
        "FIS1033": "Fisica Electricidad",
        "IST0010": "Intro. a la Ing. de Sistemas",
        "IST2088": "Algoritmia y Programacion I",
        "IST2089": "Algoritmia y Programacion II",
        "IST2110": "Programacion Orientada a Objetos",
        "IST4012": "Estructura del Computador I",
        "IST4021": "Estructura de Datos I",
        "IST4031": "Estructura de Datos II",
        "IST4310": "Algoritmia y Complejidad",
        "IST4330": "Estructuras Discretas",
        "IST4360": "Soluciones Computacionales a Problemas de Ingenieria",
        "IST7072": "Diseno Digital",
        "IST70811": "Sistemas Operativos",
        "IST7102": "Estructura del Computador II",
        "IST7111": "Bases de Datos",
        "IST7121": "Diseno de Software I",
        "IST7122": "Diseno de Software II",
        "IST7191": "Redes de Computacion",
        "IST7410": "Compiladores",
        "IST7420": "Optimizacion",
        "CAS3020": "Competencias Comunicativas I",
        "CAS3030": "Competencias Comunicativas II",
        "ELG0007": "Electiva en Ciencias Basicas",
        "ELG0008": "Electiva Basica Profesional",
        "ELG1140": "Electiva en Historia",
        "ELG1130": "Electiva en Humanidades",
        "ELG1150": "Electiva en Ciencias de la Vida",
        "ELG1160": "Electiva en Filosofia",
        "ELG1170": "Electiva en Etica",
        "ELG1180": "Electiva en Estudios del Caribe",
        "ELG1190": "Electiva en Ciencias Sociales",
        "ELG1301": "Electiva Profesional I",
        "ELG1302": "Electiva en Redes",
        "ELG1303": "Electiva Ciencias de la Computacion",
        "ELG1304": "Electiva Gestion Informatica",
        "ELG1305": "Electiva Profesional II",
        "ELG1306": "Electiva Profesional III",
        "ELG3400": "Electiva en Innovacion, Desarrollo y Sociedad",
        "ELG1201": "Electiva Profesional I",
        "ELG1202": "Electiva Profesional II",
        "ELG1203": "Electiva Profesional III",
        "ELG8400": "Electiva Innovacion, Desarrollo y Sociedad",
        "ELP4030": "Electiva Formacion Complementaria I",
        "ELP8090": "Electiva Formacion Complementaria II",
        "EST7042": "Analisis de Datos en Ing. I",
        "INV7363": "Proyecto Final",
        "INV7362": "Proyecto Final",
        "ADM5031": "Administracion y Control de la Construccion",
        "CSV0020": "Quimica General",
        "GPY1012": "Formulacion y Evaluacion de Proyectos",
        "IBA0022": "Expresion Grafica",
        "IBA4032": "Estatica",
        "ICI0010": "Introduccion a la Ingenieria Civil",
        "ICI4011": "Topografia y Geoinformacion",
        "ICI4021": "Diseno de Vias",
        "ICI4051": "Materiales de Construccion",
        "ICI4060": "Geologia",
        "ICI4070": "Hidrologia",
        "ICI4083": "Hidraulica",
        "ICI4310": "Mecanica de Suelos",
        "ICI7014": "Ingenieria de Transporte",
        "ICI7052": "Diseno Estructural",
        "ICI7081": "Construccion",
        "ICI7104": "Analisis Estructural",
        "ICI7110": "Fundaciones",
        "ICI7171": "Acueducto y Alcantarillado",
        "ICI8750": "Ingenieria Ambiental",
        "IME4070": "Mecanica de Fluidos",
        "IME4200": "Mecanica de Solidos",
    }
    if code == "FIS1043":
        return "Fisica Electricidad" if semester == 4 or "electricidad" in key else "Fisica Calor-Ondas"
    return known_names.get(code, name)


def _correct_code_from_name(code: str, name: str) -> str:
    name_key = _plain_text_key(name)
    if "estudios del caribe" in name_key:
        return "ELG1180"
    if "basica" in name_key and "profesional" in name_key:
        return "ELG0008"
    if "algoritmia" in name_key and "programacion" in name_key:
        return "IST2089" if re.search(r"\bii\b", name_key) else "IST2088"
    if "formacion" in name_key and "complement" in name_key:
        if re.search(r"\bii\b", name_key):
            return "ELP8090"
        if re.search(r"\bi\b", name_key):
            return "ELP4030"
    if "fisica" in name_key and re.match(r"^IST\d{3,5}", code):
        digits = re.sub(r"\D", "", code)[-4:]
        if digits:
            return f"FIS{digits}"

    prefix = _common_prefix_for(code)
    if not prefix:
        return code
    semester_slot = _semester_slot_from_name(name)
    if not semester_slot:
        return code
    semester, slot = semester_slot
    if 1 <= semester <= 20 and 1 <= slot <= 9:
        return f"{prefix}{semester}{slot:02d}"
    return code


def _semester_slot_from_name(name: str) -> tuple[int, int] | None:
    matches = re.findall(r"\b(\d{1,2})\s*-\s*(\d)\b", name)
    if not matches:
        return None
    semester, slot = matches[-1]
    return int(semester), int(slot)


def _merge_course(existing: ParsedCourse, incoming: ParsedCourse) -> None:
    if existing.credits == 3 and incoming.credits != 3:
        existing.credits = incoming.credits
    if _semester_slot_from_name(existing.name) is None and _semester_slot_from_name(incoming.name) is not None:
        existing.name = incoming.name
    if not _has_usable_course_name(existing.name) and _has_usable_course_name(incoming.name):
        existing.name = incoming.name
    for prereq_code in incoming.prerequisite_codes:
        if prereq_code != existing.code and prereq_code not in existing.prerequisite_codes:
            existing.prerequisite_codes.append(prereq_code)
    for warning in incoming.warnings:
        if warning not in existing.warnings:
            existing.warnings.append(warning)


def _infer_sequence_prerequisites(courses: list[ParsedCourse]) -> None:
    by_prefix_semester_slot: dict[tuple[str, int, int], ParsedCourse] = {}
    for course in courses:
        semester_slot = _semester_slot_from_name(course.name)
        prefix = _common_prefix_for(course.code)
        if not semester_slot or not prefix:
            continue
        semester, slot = semester_slot
        course.semester = semester
        by_prefix_semester_slot[(prefix, semester, slot)] = course

    for course in courses:
        semester_slot = _semester_slot_from_name(course.name)
        prefix = _common_prefix_for(course.code)
        if not semester_slot or not prefix:
            continue
        semester, slot = semester_slot
        if semester <= 1:
            continue
        allowed_prereqs: set[str] = set()
        previous = by_prefix_semester_slot.get((prefix, semester - 1, slot))
        if previous:
            allowed_prereqs.add(previous.code)
        if prefix == "IST" and semester > 2:
            math_previous = by_prefix_semester_slot.get(("MAT", semester - 1, 1))
            if math_previous:
                allowed_prereqs.add(math_previous.code)
        if allowed_prereqs:
            course.prerequisite_codes = sorted(set(course.prerequisite_codes) & allowed_prereqs | allowed_prereqs)


def _infer_known_curriculum_prerequisites(courses: list[ParsedCourse]) -> None:
    by_code = {course.code: course for course in courses}
    systems_markers = {"MAT1031", "IST2088", "IST7111", "IST7410", "INV7363"}
    if len(systems_markers & set(by_code)) < 3:
        return

    prerequisite_map = {
        "MAT1101": ["MAT1031"],
        "MAT1111": ["MAT1101"],
        "MAT1121": ["MAT1111"],
        "MAT4011": ["MAT1121"],
        "FIS1023": ["MAT1101"],
        "FIS1043": ["FIS1023"],
        "CAS3030": ["CAS3020"],
        "IST2089": ["IST2088"],
        "IST4021": ["IST2089"],
        "IST4031": ["IST4021"],
        "IST2110": ["IST2089"],
        "IST4330": ["IST4031"],
        "EST7042": ["MAT4011"],
        "IST4310": ["IST4031"],
        "IST7072": ["MAT4021"],
        "IST4012": ["IST7072"],
        "IST4360": ["EST7042", "IST4310"],
        "IST7111": ["IST4310"],
        "IST7191": ["IST4330"],
        "IST70811": ["IST7191"],
        "IST7102": ["IST4012"],
        "IST7121": ["IST7111"],
        "IST7420": ["IST4360"],
        "ELG1302": ["IST7191"],
        "IST7410": ["IST7102", "ELG1302"],
        "IST7122": ["IST7121"],
        "INV7363": ["IST7122"],
        "ELP8090": ["ELP4030"],
    }

    for code, prereq_codes in prerequisite_map.items():
        course = by_code.get(code)
        if not course:
            continue
        for prereq_code in prereq_codes:
            prereq = by_code.get(prereq_code)
            if not prereq:
                continue
            if prereq.semester >= course.semester:
                continue
            if prereq_code not in course.prerequisite_codes:
                course.prerequisite_codes.append(prereq_code)


def _infer_known_civil_curriculum_prerequisites(courses: list[ParsedCourse]) -> None:
    by_code = {course.code: course for course in courses}
    civil_markers = {"ICI0010", "IBA0022", "CSV0020", "ICI7171", "INV7362"}
    if len(civil_markers & set(by_code)) < 3:
        return

    prerequisite_map = {
        "MAT1111": ["MAT1101"],
        "MAT1121": ["MAT1111"],
        "MAT4011": ["MAT1111"],
        "FIS1023": ["MAT1101"],
        "FIS1043": ["FIS1023"],
        "FIS1033": ["FIS1023", "MAT1111"],
        "CAS3030": ["CAS3020"],
        "ICI4011": ["IBA0022"],
        "IBA4032": ["FIS1023"],
        "IME4200": ["IBA4032"],
        "ICI4051": ["IME4200"],
        "ICI7104": ["IME4200"],
        "ICI7052": ["ICI7104"],
        "IST4360": ["IST2088"],
        "ICI4310": ["IME4200", "ICI4060"],
        "ICI7110": ["ICI4310"],
        "GPY1012": ["ICI4011"],
        "ICI4021": ["ICI4011"],
        "ICI7014": ["ICI4021"],
        "ICI7081": ["ICI4051"],
        "ADM5031": ["ICI7081"],
        "IME4070": ["MAT4011"],
        "ICI4070": ["EST7042"],
        "ICI4083": ["IME4070"],
        "ICI7171": ["ICI4083"],
        "ELP8090": ["ELP4030"],
    }

    for code, prereq_codes in prerequisite_map.items():
        course = by_code.get(code)
        if not course:
            continue
        for prereq_code in prereq_codes:
            prereq = by_code.get(prereq_code)
            if not prereq:
                continue
            if prereq.semester >= course.semester:
                continue
            if prereq_code not in course.prerequisite_codes:
                course.prerequisite_codes.append(prereq_code)


def _normalize_courses(raw_courses: list[dict[str, Any]], raw_text: str | None = None) -> tuple[list[ParsedCourse], list[str]]:
    courses: list[ParsedCourse] = []
    upload_warnings: list[str] = []
    seen_codes: set[str] = set()
    seen_name_keys: set[tuple[str, str]] = set()
    course_by_code: dict[str, ParsedCourse] = {}
    course_by_name_key: dict[tuple[str, str], ParsedCourse] = {}
    text_codes = _codes_seen_in_text(raw_text or "") if raw_text is not None else set()

    for item in raw_courses:
        if not isinstance(item, dict):
            continue
        course = _course_from_raw(item)
        if not course:
            continue
        if course.code in seen_codes:
            _merge_course(course_by_code[course.code], course)
            continue
        name_key = (_common_prefix_for(course.code), _course_name_key(course.name))
        if name_key[0] and name_key[1] and name_key in seen_name_keys:
            _merge_course(course_by_name_key[name_key], course)
            continue
        seen_codes.add(course.code)
        seen_name_keys.add(name_key)
        course_by_code[course.code] = course
        course_by_name_key[name_key] = course
        courses.append(course)

    if raw_text is not None:
        heuristic_details = _heuristic_course_details(raw_text)
        credit_hints = _credit_hints_from_rows(raw_text)
        for course in courses:
            details = heuristic_details.get(course.code)
            if details:
                credits = details.get("credits")
                if isinstance(credits, int) and course.credits == 3 and credits != 3:
                    course.credits = credits
                semester = details.get("semester")
                if isinstance(semester, int) and 1 <= semester <= 20:
                    course.semester = semester
                course.prerequisite_codes = [
                    prereq_code
                    for prereq_code in details.get("prerequisite_codes", [])
                    if prereq_code != course.code
                ]
            hinted_credits = credit_hints.get(course.code)
            if isinstance(hinted_credits, int) and 1 <= hinted_credits <= 30:
                course.credits = hinted_credits

    _infer_sequence_prerequisites(courses)
    _infer_known_curriculum_prerequisites(courses)
    _infer_known_civil_curriculum_prerequisites(courses)
    _stabilize_semesters_by_prerequisites(courses)

    semester_by_code = {course.code: course.semester for course in courses}
    for course in courses:
        valid_prereqs: list[str] = []
        for prereq_code in course.prerequisite_codes:
            if text_codes and prereq_code not in text_codes and prereq_code not in semester_by_code:
                course.warnings.append(f"Prerequisito {prereq_code} omitido: no aparece en el texto extraido.")
                continue
            prereq_semester = semester_by_code.get(prereq_code)
            if prereq_semester is not None and prereq_semester >= course.semester:
                course.warnings.append(
                    f"Prerequisito {prereq_code} omitido: esta en semestre {prereq_semester}, no antes de {course.semester}."
                )
                continue
            valid_prereqs.append(prereq_code)
        course.prerequisite_codes = valid_prereqs

    return courses, upload_warnings


def _fallback_parse_courses(raw_text: str) -> list[dict[str, Any]]:
    courses: list[dict[str, Any]] = []
    current_semester = 1
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in raw_text.splitlines()
        if re.sub(r"\s+", " ", line).strip()
    ]

    for index, clean_line in enumerate(lines):
        if _is_noisy_ocr_line(clean_line):
            continue

        semester_match = re.search(r"semestre\s+(\d+)", clean_line, flags=re.IGNORECASE)
        if semester_match:
            current_semester = int(semester_match.group(1))
            continue

        code_match = CODE_TOKEN_PATTERN.search(clean_line)
        if not code_match:
            continue

        code = _normalize_code(code_match.group(1))
        after_code = clean_line[code_match.end() :].strip(" -:")
        if not _has_common_prefix(code):
            continue
        code_matches = [
            match
            for match in CODE_TOKEN_PATTERN.finditer(clean_line)
            if _has_common_prefix(_normalize_code(match.group(1)))
        ]
        if len(code_matches) > 1 and code_matches[1].start() <= code_match.end() + 3:
            continue
        credits_match = CREDITS_PATTERN.search(clean_line)
        credits = int(credits_match.group(1) or credits_match.group(2)) if credits_match else 3
        name = after_code

        if not _has_usable_course_name(name):
            name_parts: list[str] = []
            for next_line in lines[index + 1 : index + 7]:
                next_clean = re.sub(r"[+•»«=—_\\|]+", " ", next_line).strip(" -:.")
                next_credits = _credits_from_fragment(next_clean)
                if next_credits is not None:
                    credits = next_credits
                    break
                if CODE_TOKEN_PATTERN.search(next_clean):
                    break
                if not _is_noisy_ocr_line(next_clean) and _has_usable_course_name(next_clean):
                    name_parts.append(next_clean)
                if len(name_parts) >= 2:
                    break
            if name_parts:
                name = " ".join(name_parts)

        if credits_match:
            local_credit_match = CREDITS_PATTERN.search(after_code)
            if local_credit_match:
                name = after_code[: local_credit_match.start()].strip(" -:")
        name = re.sub(r"\bprere[a-z]*.*$", "", name, flags=re.IGNORECASE)
        name = re.sub(r"[+•»«=—_\\|]+", " ", name).strip(" -:|.")
        prereqs = [
            _normalize_code(match)
            for match in CODE_TOKEN_PATTERN.findall(clean_line[code_match.end() :])
        ]
        prereqs = [prereq for prereq in prereqs if prereq and prereq != code and _has_common_prefix(prereq)]
        code = _correct_code_from_name(code, name)
        name = _refine_course_name(code, name, current_semester)

        if code and _has_usable_course_name(name):
            courses.append({
                "code": code,
                "name": name,
                "credits": credits,
                "semester": current_semester,
                "prerequisite_codes": prereqs,
            })

    return courses


async def _model_names() -> list[str]:
    try:
        response = await ollama_client.list()
    except Exception:
        return []

    models = getattr(response, "models", None)
    if models is None and isinstance(response, dict):
        models = response.get("models", [])

    names: list[str] = []
    for model in models or []:
        name = getattr(model, "model", None) or getattr(model, "name", None)
        if name is None and isinstance(model, dict):
            name = model.get("model") or model.get("name")
        if name:
            names.append(name)
    return names


async def _ensure_llm_model() -> None:
    names = await _model_names()
    if LLM_MODEL not in names:
        raise HTTPException(
            status_code=422,
            detail=f"Falta el modelo local {LLM_MODEL}. Descargalo con Ollama antes de importar la malla.",
        )


def _parse_structured_ocr(raw_text: str) -> tuple[list[ParsedCourse], list[str]] | None:
    raw_courses = _fallback_parse_courses(raw_text)
    courses, warnings = _normalize_courses(raw_courses, raw_text)
    if len(courses) < 3:
        return None

    has_curriculum_signals = bool(
        re.search(r"\b(semestre|creditos?|prereq|prereg|materia|codigo)\b", raw_text, flags=re.IGNORECASE)
    )
    unique_codes = {course.code for course in courses}
    if has_curriculum_signals and len(unique_codes) == len(courses):
        return courses, warnings
    if len(courses) >= 8:
        return courses, warnings
    return None


async def _parse_with_llm(raw_text: str) -> tuple[list[ParsedCourse], list[str]]:
    structured = _parse_structured_ocr(raw_text)
    if structured is not None:
        return structured

    await _ensure_llm_model()
    prompt = (
        "Eres un asistente que extrae informacion estructurada de mallas curriculares universitarias.\n"
        "Devuelve unicamente un array JSON valido, sin markdown y sin texto adicional.\n\n"
        "Estructura exacta:\n"
        '[{"code":"MAT101","name":"Calculo Diferencial","credits":3,"semester":1,'
        '"prerequisite_codes":["MAT001"]}]\n\n'
        "Reglas:\n"
        "- Extrae todas las materias/cursos visibles.\n"
        "- code es el codigo alfanumerico de la materia.\n"
        "- Si el OCR parece confundir letras y numeros, conserva el codigo mas probable.\n"
        "- credits es un entero; usa 3 si no esta claro.\n"
        "- semester es un entero; usa el semestre del bloque si aparece.\n"
        "- prerequisite_codes contiene codigos, no nombres; usa [] si no hay prerequisitos.\n\n"
        f"Texto extraido:\n{raw_text[:9000]}"
    )

    try:
        response = await asyncio.wait_for(
            ollama_client.chat(
                model=LLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.1, "num_predict": 4096},
            ),
            timeout=120,
        )
        content = response.message.content if hasattr(response, "message") else response["message"]["content"]
        raw_courses = _extract_json_array(content)
        courses, warnings = _normalize_courses(raw_courses, raw_text)
        return courses, warnings
    except asyncio.TimeoutError:
        fallback_courses, warnings = _normalize_courses(_fallback_parse_courses(raw_text), raw_text)
        if fallback_courses:
            warnings.append("La IA tardo demasiado; se uso una extraccion basica.")
            return fallback_courses, warnings
        raise HTTPException(status_code=422, detail="La IA tardo demasiado y no se pudo extraer la malla.")
    except HTTPException:
        raise
    except Exception as exc:
        fallback_courses, warnings = _normalize_courses(_fallback_parse_courses(raw_text), raw_text)
        if fallback_courses:
            warnings.append(f"La IA no devolvio JSON valido; se uso una extraccion basica. Detalle: {exc}")
            return fallback_courses, warnings
        raise HTTPException(status_code=422, detail=f"No se pudo convertir la malla en materias: {exc}")


def _validate_courses_for_confirm(courses: list[ParsedCourse]) -> None:
    if not courses:
        raise HTTPException(status_code=422, detail="No hay materias para importar.")

    seen_codes: set[str] = set()
    semester_by_code = {course.code: course.semester for course in courses}
    for course in courses:
        if not course.code:
            raise HTTPException(status_code=422, detail="Hay una materia sin codigo.")
        if not course.name:
            raise HTTPException(status_code=422, detail=f"La materia {course.code} no tiene nombre.")
        if course.code in seen_codes:
            raise HTTPException(status_code=422, detail=f"Codigo duplicado en la vista previa: {course.code}.")
        if course.credits < 1 or course.credits > 30:
            raise HTTPException(status_code=422, detail=f"Creditos invalidos en {course.code}.")
        if course.semester < 1 or course.semester > 20:
            raise HTTPException(status_code=422, detail=f"Semestre invalido en {course.code}.")
        for prereq_code in course.prerequisite_codes:
            prereq_semester = semester_by_code.get(prereq_code)
            if prereq_semester is not None and prereq_semester >= course.semester:
                raise HTTPException(
                    status_code=422,
                    detail=f"{course.code} no puede tener como prerequisito a {prereq_code} porque no esta en un semestre anterior.",
                )
        seen_codes.add(course.code)


@router.get("/status")
async def curriculum_import_status(_admin=Depends(require_admin)):
    tesseract_command = _get_tesseract_command()
    languages = _available_ocr_languages()
    models = await _model_names()

    return {
        "ocr": {
            "available": bool(tesseract_command),
            "path": tesseract_command,
            "languages": languages,
            "has_spanish": "spa" in languages,
            "has_english": "eng" in languages,
        },
        "llm": {
            "available": LLM_MODEL in models,
            "model": LLM_MODEL,
            "installed_models": models,
        },
    }


@router.post("/upload")
async def upload_curriculum(
    program_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    program = await db.execute(select(Program).where(Program.id == program_id))
    if program.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Programa no encontrado.")

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=422,
            detail="El archivo llego vacio (0 KB). Vuelve a seleccionar el PDF original o descargalo primero si esta en OneDrive.",
        )
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="El archivo es demasiado grande. Maximo 20 MB.")

    filename = (file.filename or "").lower()
    warnings: list[str] = []

    if filename.endswith(".pdf"):
        raw_text, extract_warnings = _extract_pdf_text(content)
    elif filename.endswith(SUPPORTED_IMAGE_EXTENSIONS):
        raw_text, extract_warnings = _extract_image_text(content)
    else:
        raise HTTPException(
            status_code=415,
            detail="Formato no soportado. Usa PDF o imagen: PNG, JPG, JPEG, WEBP, TIFF o BMP.",
        )

    warnings.extend(extract_warnings)
    if not raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="No se pudo extraer texto del archivo. Si es un PDF escaneado, intenta subir una imagen clara de la malla.",
        )

    courses, parse_warnings = await _parse_with_llm(raw_text)
    warnings.extend(parse_warnings)
    if not courses:
        raise HTTPException(status_code=422, detail="No se detectaron materias en el archivo.")

    return {
        "program_id": str(program_id),
        "courses": [course.model_dump() for course in courses],
        "raw_text_length": len(raw_text),
        "warnings": warnings,
    }


@router.post("/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_curriculum(
    body: ConfirmUploadBody,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    _validate_courses_for_confirm(body.courses)

    program = await db.execute(select(Program).where(Program.id == body.program_id))
    if program.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Programa no encontrado.")

    existing_result = await db.execute(select(Course).where(Course.program_id == body.program_id))
    existing_courses = {
        _normalize_code(course.code): course
        for course in existing_result.scalars().all()
    }

    code_to_course: dict[str, Course] = dict(existing_courses)
    new_courses: list[Course] = []
    preview_by_code = {course.code: course for course in body.courses}
    known_codes = set(existing_courses) | set(preview_by_code)
    unresolved_before_save = [
        {"course": course.code, "prerequisite": prereq_code}
        for course in body.courses
        for prereq_code in course.prerequisite_codes
        if prereq_code not in known_codes
    ]
    if unresolved_before_save:
        details = ", ".join(
            f"{item['course']} -> {item['prerequisite']}" for item in unresolved_before_save[:5]
        )
        raise HTTPException(
            status_code=422,
            detail=f"Hay prerequisitos que no existen en la vista previa ni en el programa: {details}.",
        )

    for parsed_course in body.courses:
        if parsed_course.code in code_to_course:
            continue
        course = Course(
            code=parsed_course.code,
            name=parsed_course.name,
            credits=parsed_course.credits,
            semester=parsed_course.semester,
            program_id=body.program_id,
        )
        db.add(course)
        new_courses.append(course)
        code_to_course[parsed_course.code] = course

    await db.flush()

    created_prereqs = 0
    unresolved_prerequisites: list[dict[str, str]] = []
    for parsed_course in body.courses:
        course = code_to_course.get(parsed_course.code)
        if not course:
            continue

        for prereq_code in parsed_course.prerequisite_codes:
            if prereq_code == parsed_course.code:
                continue
            prereq_course = code_to_course.get(prereq_code)
            if prereq_course is None and prereq_code in preview_by_code:
                prereq_course = code_to_course.get(preview_by_code[prereq_code].code)
            if prereq_course is None:
                unresolved_prerequisites.append({"course": parsed_course.code, "prerequisite": prereq_code})
                continue

            existing_prereq = await db.execute(
                select(Prerequisite).where(
                    Prerequisite.course_id == course.id,
                    Prerequisite.prerequisite_course_id == prereq_course.id,
                )
            )
            if existing_prereq.scalar_one_or_none() is None:
                db.add(Prerequisite(course_id=course.id, prerequisite_course_id=prereq_course.id))
                created_prereqs += 1

    await db.commit()

    return {
        "created_courses": len(new_courses),
        "skipped_existing": len(body.courses) - len(new_courses),
        "created_prerequisites": created_prereqs,
        "unresolved_prerequisites": unresolved_prerequisites,
    }
