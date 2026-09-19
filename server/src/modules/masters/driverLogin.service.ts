// Linking a driver record to a DRIVER app login (admin only). One login per
// driver; the login must have the DRIVER role, so an office account can never
// be turned into a driver view by accident.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { revokeUserSessions } from '../../core/sessions.js';
import { currentOrganizationId } from '../../core/requestContext.js';

/** DRIVER accounts and the driver each one is linked to. */
export async function listDriverLogins() {
  const users = await prisma.user.findMany({ where: { role: 'DRIVER' }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, isActive: true, driverProfile: { select: { id: true, name: true } } } });
  return users.map(u => ({ id: u.id, name: u.name, email: u.email, isActive: u.isActive, driverId: u.driverProfile?.id ?? null, driverName: u.driverProfile?.name ?? null }));
}

export async function linkDriverLogin(driverId: string, userId: string | null, actorId?: string | null) {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, name: true, userId: true } });
  if (!d) throw notFound('Driver');
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, driverProfile: { select: { id: true, name: true } } } });
    if (!u || u.role !== 'DRIVER') throw new AppError('VALIDATION_ERROR', 400, 'Choose a login with the Driver role', { userId: 'Not a driver login' });
    if (u.driverProfile && u.driverProfile.id !== driverId) throw new AppError('CONFLICT', 409, `That login already belongs to ${u.driverProfile.name}`);
  }
  try {
    await prisma.$transaction(async tx => {
      await tx.driver.update({ where: { id: driverId }, data: { userId } });
      await audit(tx, {
        action: 'driver_login_linked', entityType: 'driver', entityId: driverId, userId: actorId,
        description: userId ? `Driver ${d.name} can now sign in to the driver view` : `Driver ${d.name}'s app login removed`, before: { userId: d.userId }, after: { userId },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 409, 'That login already belongs to another driver');
    throw e;
  }
  // The previous login loses the driver view at once.
  if (d.userId && d.userId !== userId) await revokeUserSessions(d.userId, currentOrganizationId(), 'driver_unlinked');
  return listDriverLogins();
}
