// ============================================================
// Roles — the four system roles (in code) and the ones the owner makes.
//
// A custom role has a base role (the classic screens guard by it, and it is
// what redaction falls back to) and the exact permissions it grants, chosen
// from the catalogue of everything the system roles use. It can never grant
// "everything", the driver view, or managing people. Assigning a role, or
// deleting one, signs the person out everywhere (as any role change does).
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ROLE_PERMISSIONS } from '../../lib/permissions.js';
import { audit } from '../../core/audit.js';
import { AppError, conflict, notFound } from '../../core/errors.js';
import { forgetPrincipal } from '../../core/principals.js';
import { revokeUserSessions } from '../../core/sessions.js';
import { currentOrganizationId } from '../../core/requestContext.js';
import { NOT_GRANTABLE, permissionLabel, type RoleAssign, type RoleInput } from '../../../../src/shared/contracts/roles.js';

/** Every permission a custom role may be given, with its label. */
export function catalogue() {
  const all = [...new Set(Object.values(ROLE_PERMISSIONS).flat())].filter(p => !NOT_GRANTABLE.has(p)).sort();
  return all.map(key => ({ key, label: permissionLabel(key) }));
}

function checked(input: RoleInput): string[] {
  const allowed = new Set(catalogue().map(c => c.key));
  const bad = input.permissions.filter(p => !allowed.has(p));
  if (bad.length) throw new AppError('VALIDATION_ERROR', 400, `These cannot be given to a custom role: ${bad.join(', ')}`, { permissions: bad.join(',') });
  return [...new Set(input.permissions)].sort();
}

export async function listRoles() {
  const [custom, counts, users] = await Promise.all([
    prisma.accessRole.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.groupBy({ by: ['customRoleId'], where: { isActive: true, customRoleId: { not: null } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true, customRoleId: true } }),
  ]);
  const people = new Map(counts.map(c => [c.customRoleId, c._count._all]));
  return {
    system: (['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const).map(r => ({ key: r, permissions: r === 'ADMIN' ? ['*'] : ROLE_PERMISSIONS[r] })),
    custom: custom.map(r => ({ id: r.id, name: r.name, description: r.description, baseRole: r.baseRole, permissions: r.permissions as string[], people: people.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString() })),
    catalogue: catalogue(),
    people: users,
  };
}

export async function createRole(input: RoleInput, actorId?: string | null) {
  const permissions = checked(input);
  if (await prisma.accessRole.findFirst({ where: { name: input.name } })) throw conflict(`A role called "${input.name}" already exists`);
  const r = await prisma.$transaction(async tx => {
    const row = await tx.accessRole.create({ data: { name: input.name, description: input.description, baseRole: input.baseRole, permissions, createdById: actorId ?? null } });
    await audit(tx, { action: 'role_created', entityType: 'access_role', entityId: row.id, userId: actorId, description: `Role "${row.name}" made (based on ${row.baseRole})`, after: { permissions } });
    return row;
  });
  return r;
}

export async function updateRole(id: string, input: RoleInput, actorId?: string | null) {
  const before = await prisma.accessRole.findUnique({ where: { id } });
  if (!before) throw notFound('Role');
  const permissions = checked(input);
  const baseChanged = before.baseRole !== input.baseRole;
  const r = await prisma.$transaction(async tx => {
    const row = await tx.accessRole.update({ where: { id }, data: { name: input.name, description: input.description, baseRole: input.baseRole, permissions, updatedById: actorId ?? null } });
    if (baseChanged) await tx.user.updateMany({ where: { customRoleId: id }, data: { role: input.baseRole } });
    await audit(tx, {
      action: 'role_updated', entityType: 'access_role', entityId: id, userId: actorId, description: `Role "${row.name}" changed`,
      before: { name: before.name, baseRole: before.baseRole, permissions: before.permissions as Prisma.JsonValue }, after: { name: row.name, baseRole: row.baseRole, permissions },
    });
    return row;
  });
  forgetPrincipal(`custom:${id}`);
  // A new base role changes what the classic screens show: those people sign in again.
  if (baseChanged) for (const u of await prisma.user.findMany({ where: { customRoleId: id }, select: { id: true } })) await revokeUserSessions(u.id, currentOrganizationId(), 'role_changed');
  return r;
}

export async function deleteRole(id: string, actorId?: string | null) {
  const role = await prisma.accessRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
  if (!role) throw notFound('Role');
  await prisma.$transaction(async tx => {
    await tx.user.updateMany({ where: { customRoleId: id }, data: { customRoleId: null } });
    await tx.accessRole.delete({ where: { id } });
    await audit(tx, { action: 'role_deleted', entityType: 'access_role', entityId: id, userId: actorId, description: `Role "${role.name}" removed; ${role.users.length} person(s) back to ${role.baseRole}` });
  });
  forgetPrincipal(`custom:${id}`);
  for (const u of role.users) await revokeUserSessions(u.id, currentOrganizationId(), 'role_deleted');
}

export async function assignRole(input: RoleAssign, actorId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, role: true, isActive: true, customRoleId: true } });
  if (!user || !user.isActive) throw notFound('Person');
  if (user.role === 'ADMIN' || user.role === 'DRIVER') throw new AppError('STATE_CONFLICT', 409, 'The owner and drivers keep their own roles');
  const role = input.roleId ? await prisma.accessRole.findUnique({ where: { id: input.roleId } }) : null;
  if (input.roleId && !role) throw notFound('Role');
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { customRoleId: role?.id ?? null, ...(role ? { role: role.baseRole } : {}) } });
    await audit(tx, {
      action: 'role_assigned', entityType: 'user', entityId: user.id, userId: actorId,
      description: `${user.name}: ${role ? `role "${role.name}"` : `back to ${user.role}`}`, before: { role: user.role, customRoleId: user.customRoleId }, after: { role: role?.baseRole ?? user.role, customRoleId: role?.id ?? null },
    });
  });
  await revokeUserSessions(user.id, currentOrganizationId(), 'role_changed');
  return { ok: true };
}
