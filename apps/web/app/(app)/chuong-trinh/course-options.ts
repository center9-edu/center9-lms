// Course subjects ("Nhóm") and levels, agreed 2026-11-26; mirror COURSE_SUBJECTS and COURSE_LEVELS in the API's
// courses.dto.ts. No server-only imports here: client forms use them too.

export const COURSE_SUBJECTS = [
  { value: 'SCRATCH', label: 'Scratch' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'WEB', label: 'Web' },
  { value: 'ROBOTICS', label: 'Robotics' },
] as const;

export const COURSE_LEVELS = [
  { value: 'BASIC', label: 'Cơ bản' },
  { value: 'INTERMEDIATE', label: 'Trung cấp' },
  { value: 'ADVANCED', label: 'Nâng cao' },
] as const;

const labelOf = (options: readonly { value: string; label: string }[], value: string): string =>
  options.find((option) => option.value === value)?.label ?? value;

export const subjectLabel = (subject: string): string => labelOf(COURSE_SUBJECTS, subject);
export const levelLabel = (level: string): string => labelOf(COURSE_LEVELS, level);
