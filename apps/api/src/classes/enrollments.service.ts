import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EnrollmentStatus, Prisma } from '@center9/database';
import type { AuthContext } from '../auth/auth.dto.js';
import { PrismaService } from '../prisma.service.js';
import type { EnrollmentDto } from './classes.dto.js';
import { classVisibleTo, lockOpenClass } from './classes.service.js';

/**
 * From ACTIVE a student completes, drops out (for good) or is removed (by mistake, so it can be undone).
 * Only REMOVED comes back; COMPLETED and DROPPED are final.
 */
const NEXT_STATUSES: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  ACTIVE: ['COMPLETED', 'DROPPED', 'REMOVED'],
  REMOVED: ['ACTIVE'],
  COMPLETED: [],
  DROPPED: [],
};

const WITH_STUDENT = { student: { select: { studentCode: true, user: { select: { fullName: true } } } } } satisfies Prisma.ClassEnrollmentInclude;

type EnrollmentWithStudent = Prisma.ClassEnrollmentGetPayload<{ include: typeof WITH_STUDENT }>;

function toDto(row: EnrollmentWithStudent): EnrollmentDto {
  return {
    id: row.id,
    studentId: row.studentId,
    studentCode: row.student.studentCode,
    fullName: row.student.user.fullName,
    status: row.status,
    enrolledAt: row.enrolledAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
    nextStatuses: NEXT_STATUSES[row.status],
  };
}

/** The students of a class. Every write locks the class row first, so a seat count holds until the insert. */
@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff see every class's students; a teacher only those of a class they teach (404 otherwise). */
  async list(actor: AuthContext, classId: string): Promise<EnrollmentDto[]> {
    if (!(await this.prisma.class.findFirst({ where: { id: classId, ...classVisibleTo(actor) }, select: { id: true } }))) {
      throw new NotFoundException();
    }
    const rows = await this.prisma.classEnrollment.findMany({
      where: { classId },
      include: WITH_STUDENT,
      // ACTIVE is declared first in the enum, so current students come first.
      orderBy: [{ status: 'asc' }, { student: { user: { fullName: 'asc' } } }],
    });
    return rows.map(toDto);
  }

  /** Adds the student, or brings back one who was REMOVED; a student who completed or dropped out cannot rejoin. */
  async enroll(actor: AuthContext, classId: string, studentId: string): Promise<EnrollmentDto> {
    return this.prisma.$transaction(async (tx) => {
      const { capacity } = await lockOpenClass(tx, classId);
      await this.assertActiveStudent(tx, studentId);
      const existing = await tx.classEnrollment.findUnique({ where: { classId_studentId: { classId, studentId } } });
      if (existing && existing.status !== 'REMOVED') {
        throw new ConflictException(`The student is already ${existing.status} in this class`);
      }
      await this.assertSeat(tx, classId, capacity);
      const row = existing
        ? await tx.classEnrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE', leftAt: null }, include: WITH_STUDENT })
        : await tx.classEnrollment.create({ data: { classId, studentId }, include: WITH_STUDENT });
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: existing ? 'enrollment.restored' : 'enrollment.created', entityType: 'enrollment', entityId: row.id, metadata: { classId } },
      });
      return toDto(row);
    });
  }

  async setStatus(actor: AuthContext, classId: string, enrollmentId: string, status: EnrollmentStatus): Promise<EnrollmentDto> {
    return this.prisma.$transaction(async (tx) => {
      const { capacity } = await lockOpenClass(tx, classId);
      const current = await tx.classEnrollment.findFirst({ where: { id: enrollmentId, classId } });
      if (!current) {
        throw new NotFoundException();
      }
      const from = current.status;
      if (!NEXT_STATUSES[from].includes(status)) {
        throw new ConflictException(`A ${from} student cannot become ${status}`);
      }
      if (status === 'ACTIVE') {
        await this.assertActiveStudent(tx, current.studentId);
        await this.assertSeat(tx, classId, capacity);
      }
      // classes_enrollments_left_at_status_check: left_at is set exactly while DROPPED or REMOVED.
      const leftAt = status === 'DROPPED' || status === 'REMOVED' ? new Date() : null;
      const row = await tx.classEnrollment.update({ where: { id: enrollmentId }, data: { status, leftAt }, include: WITH_STUDENT });
      await tx.auditLog.create({
        data: { actorId: actor.user.id, action: 'enrollment.status_changed', entityType: 'enrollment', entityId: enrollmentId, metadata: { classId, from, to: status } },
      });
      return toDto(row);
    });
  }

  /** Only ACTIVE students take a seat; call it after lockOpenClass, so no other enrollment lands in between. */
  /** Only an active account takes a seat, whether enrolled or restored. */
  private async assertActiveStudent(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
    const profile = await tx.studentProfile.findUnique({ where: { userId: studentId }, select: { user: { select: { status: true } } } });
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    if (profile.user.status !== 'ACTIVE') {
      throw new ConflictException('The student account is not active');
    }
  }

  private async assertSeat(tx: Prisma.TransactionClient, classId: string, capacity: number | null): Promise<void> {
    if (capacity !== null && (await tx.classEnrollment.count({ where: { classId, status: 'ACTIVE' } })) >= capacity) {
      throw new ConflictException('The class is full');
    }
  }
}
