import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, Upload, FileText, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Program {
  id: string
  name: string
  is_active: boolean
}

interface Course {
  id: string
  code: string
  name: string
  credits: number
  semester: number
  description: string | null
  program_id: string
}

interface Prerequisite {
  id: string
  course_id: string
  prerequisite_course_id: string
}

interface ApiError {
  response?: {
    data?: {
      detail?: string
    }
  }
}

function getApiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiError).response?.data?.detail ?? fallback
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

// ─── Programs Tab ─────────────────────────────────────────────────────────────

function ProgramsTab() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ['admin', 'programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (name: string) => api.post('/admin/programs', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'programs'] }); setNewName('') },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/admin/programs/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'programs'] }); setEditId(null) },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/programs/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'programs'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/programs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'programs'] }),
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Add form */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMut.mutate(newName.trim())}
          placeholder="Nombre del programa..."
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
        />
        <button
          onClick={() => newName.trim() && createMut.mutate(newName.trim())}
          disabled={!newName.trim() || createMut.isPending}
          className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Plus size={14} /> Agregar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">Cargando...</td></tr>
            )}
            {programs.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  {editId === p.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="border border-indigo-300 rounded-lg px-2 py-1 text-sm outline-none w-full"
                    />
                  ) : (
                    <span className="font-medium text-slate-900">{p.name}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleMut.mutate({ id: p.id, is_active: !p.is_active })}>
                    <Badge active={p.is_active} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editId === p.id ? (
                      <>
                        <button
                          onClick={() => updateMut.mutate({ id: p.id, name: editName })}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditId(p.id); setEditName(p.name) }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) deleteMut.mutate(p.id) }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Courses Tab ──────────────────────────────────────────────────────────────

function CoursesTab() {
  const qc = useQueryClient()
  const [selectedProgram, setSelectedProgram] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', credits: 3, semester: 1, description: '' })

  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ['admin', 'programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ['admin', 'courses', selectedProgram],
    queryFn: () => api.get(`/admin/courses?program_id=${selectedProgram}`).then((r) => r.data),
    enabled: !!selectedProgram,
  })

  const createMut = useMutation({
    mutationFn: (data: typeof form & { program_id: string }) => api.post('/admin/courses', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'courses'] }); setShowForm(false); setForm({ code: '', name: '', credits: 3, semester: 1, description: '' }) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) => api.patch(`/admin/courses/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'courses'] }); setEditId(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/courses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'courses'] }),
  })

  const grouped = courses.reduce((acc, c) => {
    const key = c.semester
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {} as Record<number, Course[]>)

  return (
    <div className="flex flex-col gap-4">
      {/* Program selector */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white text-slate-700"
          >
            <option value="">Seleccionar programa...</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {selectedProgram && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <Plus size={14} /> Nueva materia
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-900">Nueva materia</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Código (ej. MAT101)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la materia" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: +e.target.value })} placeholder="Créditos" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input type="number" value={form.semester} onChange={(e) => setForm({ ...form, semester: +e.target.value })} placeholder="Semestre" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción (opcional)" className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancelar</button>
            <button
              onClick={() => form.code && form.name && createMut.mutate({ ...form, program_id: selectedProgram })}
              disabled={!form.code || !form.name || createMut.isPending}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Courses list grouped by semester */}
      {!selectedProgram && (
        <div className="text-center text-slate-400 text-sm py-12">Selecciona un programa para ver sus materias</div>
      )}
      {selectedProgram && isLoading && (
        <div className="text-center text-slate-400 text-sm py-12">Cargando...</div>
      )}
      {Object.entries(grouped).sort(([a], [b]) => +a - +b).map(([sem, semCourses]) => (
        <div key={sem} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Semestre {sem}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Código</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Nombre</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Créditos</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {semCourses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    {editId === c.id ? (
                      <input defaultValue={c.code} id={`code-${c.id}`} className="border border-indigo-300 rounded px-2 py-0.5 text-xs w-24 outline-none" />
                    ) : (
                      <code className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{c.code}</code>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {editId === c.id ? (
                      <input defaultValue={c.name} id={`name-${c.id}`} className="border border-indigo-300 rounded px-2 py-0.5 text-sm w-full outline-none" />
                    ) : c.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{c.credits}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {editId === c.id ? (
                        <>
                          <button
                            onClick={() => {
                              const code = (document.getElementById(`code-${c.id}`) as HTMLInputElement).value
                              const name = (document.getElementById(`name-${c.id}`) as HTMLInputElement).value
                              updateMut.mutate({ id: c.id, data: { code, name } })
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditId(c.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteMut.mutate(c.id) }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Prerequisites Tab ────────────────────────────────────────────────────────

function PrerequisitesTab() {
  const qc = useQueryClient()
  const [selectedProgram, setSelectedProgram] = useState<string>('')
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [prereqCourseId, setPrereqCourseId] = useState<string>('')

  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ['admin', 'programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ['admin', 'courses', selectedProgram],
    queryFn: () => api.get(`/admin/courses?program_id=${selectedProgram}`).then((r) => r.data),
    enabled: !!selectedProgram,
  })

  const { data: prereqs = [] } = useQuery<Prerequisite[]>({
    queryKey: ['admin', 'prerequisites', selectedCourse],
    queryFn: () => api.get(`/admin/prerequisites?course_id=${selectedCourse}`).then((r) => r.data),
    enabled: !!selectedCourse,
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/admin/prerequisites', {
      course_id: selectedCourse,
      prerequisite_course_id: prereqCourseId,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'prerequisites'] }); setPrereqCourseId('') },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/prerequisites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'prerequisites'] }),
  })

  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]))

  const availablePrereqs = courses.filter(
    (c) => c.id !== selectedCourse && !prereqs.some((p) => p.prerequisite_course_id === c.id)
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={selectedProgram}
            onChange={(e) => { setSelectedProgram(e.target.value); setSelectedCourse('') }}
            className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm outline-none bg-white text-slate-700"
          >
            <option value="">Programa...</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {selectedProgram && (
          <div className="relative">
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm outline-none bg-white text-slate-700"
            >
              <option value="">Materia...</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {selectedCourse && (
        <>
          {/* Current prereqs */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900">
                Prerequisitos de: <span className="text-indigo-600">{courseMap[selectedCourse]?.name}</span>
              </p>
            </div>
            {prereqs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">Sin prerequisitos definidos</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {prereqs.map((p) => {
                  const course = courseMap[p.prerequisite_course_id]
                  return (
                    <li key={p.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          {course?.code ?? '?'}
                        </code>
                        <span className="text-sm text-slate-700">{course?.name ?? p.prerequisite_course_id}</span>
                      </div>
                      <button
                        onClick={() => deleteMut.mutate(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Add prereq */}
          {availablePrereqs.length > 0 && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={prereqCourseId}
                  onChange={(e) => setPrereqCourseId(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm outline-none bg-white text-slate-700"
                >
                  <option value="">Agregar prerequisito...</option>
                  {availablePrereqs.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button
                onClick={() => prereqCourseId && createMut.mutate()}
                disabled={!prereqCourseId || createMut.isPending}
                className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>
          )}
        </>
      )}

      {!selectedCourse && (
        <div className="text-center text-slate-400 text-sm py-12">
          Selecciona un programa y una materia para gestionar sus prerequisitos
        </div>
      )}
    </div>
  )
}

// ─── Curriculum Upload Tab ────────────────────────────────────────────────────

interface ParsedCourse {
  code: string
  name: string
  credits: number
  semester: number
  prerequisite_codes: string[]
  warnings?: string[]
}

interface CurriculumImportStatus {
  ocr: {
    available: boolean
    languages: string[]
    has_spanish: boolean
    has_english: boolean
  }
  llm: {
    available: boolean
    model: string
    installed_models: string[]
  }
}

interface CurriculumUploadResponse {
  courses: ParsedCourse[]
  raw_text_length: number
  warnings: string[]
}

interface CurriculumConfirmResponse {
  created_courses: number
  created_prerequisites: number
  unresolved_prerequisites?: string[]
}

function normalizePreviewCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function splitPrerequisiteCodes(value: string) {
  return value
    .split(/[,;/\s]+/)
    .map(normalizePreviewCode)
    .filter(Boolean)
    .filter((code, index, list) => list.indexOf(code) === index)
}

function CurriculumUploadTab() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedProgram, setSelectedProgram] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedCourse[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [rawTextLength, setRawTextLength] = useState<number | null>(null)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ['admin', 'programs'],
    queryFn: () => api.get('/admin/programs').then((r) => r.data),
  })

  const { data: importStatus } = useQuery<CurriculumImportStatus>({
    queryKey: ['admin', 'curriculum-status'],
    queryFn: () => api.get('/admin/curriculum/status').then((r) => r.data),
  })

  const { data: existingCourses = [] } = useQuery<Course[]>({
    queryKey: ['admin', 'courses', selectedProgram],
    queryFn: () => api.get(`/admin/courses?program_id=${selectedProgram}`).then((r) => r.data),
    enabled: !!selectedProgram,
  })

  const confirmMut = useMutation({
    mutationFn: (courses: ParsedCourse[]) =>
      api.post<CurriculumConfirmResponse>('/admin/curriculum/confirm', { program_id: selectedProgram, courses }),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
      const data = response.data
      const unresolved = data.unresolved_prerequisites?.length ?? 0
      setConfirmMessage(
        `Importacion lista: ${data.created_courses} materias nuevas, ${data.created_prerequisites} prerequisitos creados${unresolved ? `, ${unresolved} prerequisitos por revisar` : ''}.`
      )
      setConfirmError(null)
      setPreview(null)
      setFile(null)
    },
    onError: (e: unknown) => {
      setConfirmError(getApiErrorMessage(e, 'No se pudo guardar la importacion'))
    },
  })

  const existingCodes = useMemo(
    () => new Set(existingCourses.map((course) => normalizePreviewCode(course.code))),
    [existingCourses],
  )

  const previewIssues = useMemo(() => {
    if (!preview) return []
    const issues: string[] = []
    const previewCodes = preview.map((course) => normalizePreviewCode(course.code))
    const previewCodeSet = new Set(previewCodes)
    const semesterByCode = preview.reduce((acc, course) => {
      acc[normalizePreviewCode(course.code)] = course.semester
      return acc
    }, {} as Record<string, number>)
    const counts = previewCodes.reduce((acc, code) => {
      acc[code] = (acc[code] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    preview.forEach((course, index) => {
      const row = index + 1
      const code = normalizePreviewCode(course.code)
      if (!code) issues.push(`Fila ${row}: falta el codigo.`)
      if (!course.name.trim()) issues.push(`Fila ${row}: falta el nombre.`)
      if (counts[code] > 1) issues.push(`Fila ${row}: codigo duplicado ${code}.`)
      if (course.credits < 1 || course.credits > 30) issues.push(`Fila ${row}: creditos fuera de rango.`)
      if (course.semester < 1 || course.semester > 20) issues.push(`Fila ${row}: semestre fuera de rango.`)
      course.prerequisite_codes.forEach((prereq) => {
        const prereqCode = normalizePreviewCode(prereq)
        if (prereqCode && prereqCode !== code && !previewCodeSet.has(prereqCode) && !existingCodes.has(prereqCode)) {
          issues.push(`Fila ${row}: prerequisito ${prereqCode} no aparece en la vista previa ni en materias existentes.`)
        }
        if (semesterByCode[prereqCode] !== undefined && semesterByCode[prereqCode] >= course.semester) {
          issues.push(`Fila ${row}: prerequisito ${prereqCode} no esta en un semestre anterior.`)
        }
      })
    })

    return issues
  }, [existingCodes, preview])

  const llmReady = importStatus?.llm.available ?? false
  const ocrReady = !!importStatus?.ocr.available && (!!importStatus?.ocr.has_spanish || !!importStatus?.ocr.has_english)
  const fileNeedsOcr = !!file && !file.name.toLowerCase().endsWith('.pdf')
  const setupBlocksUpload = !!importStatus && (!llmReady || (fileNeedsOcr && !ocrReady))

  const handleUpload = async () => {
    if (!file || !selectedProgram) return
    if (file.size === 0) {
      setUploadError('El archivo seleccionado esta vacio (0 KB). Vuelve a elegir el PDF original o descargalo primero si esta en OneDrive.')
      return
    }
    setUploading(true)
    setUploadError(null)
    setConfirmMessage(null)
    setConfirmError(null)
    setUploadWarnings([])
    setRawTextLength(null)
    try {
      const formData = new FormData()
      formData.append('program_id', selectedProgram)
      formData.append('file', file)
      const res = await api.post<CurriculumUploadResponse>('/admin/curriculum/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(res.data.courses)
      setUploadWarnings(res.data.warnings ?? [])
      setRawTextLength(res.data.raw_text_length ?? null)
    } catch (e: unknown) {
      setUploadError(getApiErrorMessage(e, 'Error al procesar el archivo'))
    } finally {
      setUploading(false)
    }
  }

  const updatePreview = (idx: number, field: keyof ParsedCourse, value: string | number) => {
    if (!preview) return
    const updated = [...preview]
    updated[idx] = { ...updated[idx], [field]: value }
    setPreview(updated)
  }

  const updatePrerequisites = (idx: number, value: string) => {
    if (!preview) return
    const updated = [...preview]
    updated[idx] = { ...updated[idx], prerequisite_codes: splitPrerequisiteCodes(value) }
    setPreview(updated)
  }

  const selectFile = (nextFile: File | null) => {
    setFile(nextFile)
    setPreview(null)
    setUploadError(
      nextFile?.size === 0
        ? 'El archivo seleccionado esta vacio (0 KB). Vuelve a elegir el PDF original o descargalo primero si esta en OneDrive.'
        : null
    )
    setConfirmMessage(null)
    setConfirmError(null)
    setUploadWarnings([])
    setRawTextLength(null)
  }

  const removeFromPreview = (idx: number) => {
    if (!preview) return
    setPreview(preview.filter((_, i) => i !== idx))
  }

  const addManualCourse = () => {
    if (!preview) return
    const lastSemester = preview.length > 0 ? preview[preview.length - 1].semester : 1
    setPreview([
      ...preview,
      {
        code: '',
        name: '',
        credits: 3,
        semester: lastSemester,
        prerequisite_codes: [],
        warnings: [],
      },
    ])
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-500">
        Sube un PDF o imagen de la malla curricular. MaIA usará OCR + IA para extraer las materias automáticamente.
        Revisa el resultado antes de confirmar.
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${ocrReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {ocrReady ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          OCR {ocrReady ? 'listo' : 'por configurar'}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${llmReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {llmReady ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          IA {llmReady ? 'lista' : 'por configurar'}
        </span>
        {importStatus && !importStatus.ocr.has_spanish && importStatus.ocr.has_english && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
            <AlertTriangle size={13} /> OCR sin espanol
          </span>
        )}
      </div>

      {confirmMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
          {confirmMessage}
        </div>
      )}

      {/* Step 1: Select program + file */}
      {!preview && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-900">1. Selecciona el programa y el archivo</p>

          <div className="relative w-fit">
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm outline-none bg-white text-slate-700"
            >
              <option value="">Seleccionar programa...</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              selectFile(event.dataTransfer.files?.[0] ?? null)
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              file ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText size={28} className="text-indigo-500" />
                <p className="text-sm font-medium text-indigo-700">{file.name}</p>
                <p className="text-xs text-indigo-500">{(file.size / 1024).toFixed(0)} KB — haz clic para cambiar</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={28} className="text-slate-400" />
                <p className="text-sm text-slate-500">Arrastra un PDF o imagen, o haz clic para seleccionar</p>
                <p className="text-xs text-slate-400">PDF, PNG, JPG, JPEG, WEBP</p>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp"
            className="hidden"
            onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          />

          {setupBlocksUpload && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {!llmReady ? `Falta el modelo ${importStatus?.llm.model ?? 'de IA'} en Ollama.` : 'El OCR no esta listo para este tipo de archivo.'}
              </span>
            </div>
          )}

          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              {uploadError}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !selectedProgram || uploading || setupBlocksUpload}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors w-fit"
          >
            {uploading ? <><Loader2 size={14} className="animate-spin" /> Procesando con IA...</> : <><Upload size={14} /> Extraer materias</>}
          </button>
        </div>
      )}

      {/* Step 2: Review + confirm */}
      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">
              2. Revisa y confirma — <span className="text-indigo-600">{preview.length} materias detectadas</span>
            </p>
            <button
              onClick={() => setPreview(null)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ← Volver
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={addManualCourse}
              className="flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Plus size={13} /> Agregar materia
            </button>
          </div>

          {rawTextLength !== null && (
            <p className="text-xs text-slate-400">
              Texto leido: {rawTextLength.toLocaleString()} caracteres.
            </p>
          )}

          {uploadWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle size={15} /> Alertas de lectura
              </div>
              <ul className="mt-1 list-disc pl-5">
                {uploadWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          )}

          {previewIssues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle size={15} /> Revisa antes de guardar
              </div>
              <ul className="mt-1 list-disc pl-5">
                {previewIssues.slice(0, 8).map((issue, index) => <li key={index}>{issue}</li>)}
                {previewIssues.length > 8 && <li>{previewIssues.length - 8} alertas mas.</li>}
              </ul>
            </div>
          )}

          {confirmError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {confirmError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400">Código</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400">Nombre</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400">Créditos</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400">Semestre</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400">Prerequisitos</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        value={c.code}
                        onChange={(e) => updatePreview(idx, 'code', e.target.value)}
                        onBlur={() => updatePreview(idx, 'code', normalizePreviewCode(c.code))}
                        className="border border-slate-200 rounded px-2 py-0.5 text-xs w-20 outline-none focus:border-indigo-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={c.name}
                        onChange={(e) => updatePreview(idx, 'name', e.target.value)}
                        className="border border-slate-200 rounded px-2 py-0.5 text-sm w-full outline-none focus:border-indigo-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={c.credits}
                        onChange={(e) => updatePreview(idx, 'credits', +e.target.value)}
                        className="border border-slate-200 rounded px-2 py-0.5 text-sm w-14 outline-none focus:border-indigo-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={c.semester}
                        onChange={(e) => updatePreview(idx, 'semester', +e.target.value)}
                        className="border border-slate-200 rounded px-2 py-0.5 text-sm w-16 outline-none focus:border-indigo-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={c.prerequisite_codes.join(', ')}
                        onChange={(e) => updatePrerequisites(idx, e.target.value)}
                        placeholder="-"
                        className="border border-slate-200 rounded px-2 py-0.5 text-xs w-36 outline-none focus:border-indigo-300"
                      />
                      {c.warnings && c.warnings.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-amber-600">
                          {c.warnings.map((warning, warningIndex) => <span key={warningIndex}>{warning}</span>)}
                        </div>
                      )}
                      <span className="hidden">
                      {c.prerequisite_codes.join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeFromPreview(idx)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {confirmMut.isSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
              Importacion exitosa! {confirmMut.data?.data.created_courses ?? 0} materias creadas.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => confirmMut.mutate(preview)}
              disabled={confirmMut.isPending || preview.length === 0 || previewIssues.length > 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {confirmMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Confirmar e importar</>}
            </button>
            <button
              type="button"
              onClick={addManualCourse}
              className="flex items-center gap-2 border border-slate-200 bg-white px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Plus size={14} /> Agregar materia
            </button>
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'programs' | 'courses' | 'prerequisites' | 'import'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('programs')

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">Panel Administrativo</h2>
        <p className="text-sm text-slate-500 mt-0.5">Gestiona programas, materias y dependencias del plan curricular</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <TabButton active={tab === 'programs'} onClick={() => setTab('programs')}>Programas</TabButton>
        <TabButton active={tab === 'courses'} onClick={() => setTab('courses')}>Materias</TabButton>
        <TabButton active={tab === 'prerequisites'} onClick={() => setTab('prerequisites')}>Prerequisitos</TabButton>
        <TabButton active={tab === 'import'} onClick={() => setTab('import')}>Importar Malla</TabButton>
      </div>

      {/* Tab content */}
      {tab === 'programs' && <ProgramsTab />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'prerequisites' && <PrerequisitesTab />}
      {tab === 'import' && <CurriculumUploadTab />}
    </div>
  )
}
