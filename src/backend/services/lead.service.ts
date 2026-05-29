import { supabase } from '@/backend/supabase/client';
import { leadRepository, type LeadFilters, type LeadCreateData, type LeadUpdateData } from '@/backend/repositories/lead.repository';
import { activityRepository } from '@/backend/repositories/activity.repository';
import type { DbLead, LeadStatus, LeadPriority } from '@/backend/supabase/database.types';
import type { PaginatedResult } from '@/backend/repositories/base.repository';

export interface CreateLeadInput {
  name:          string;
  phone:         string;
  email?:        string;
  source:        string;
  destination?:  string;
  travelDate?:   string;
  pax?:          number;
  budget?:       number | null;
  tripType?:     string;
  priority?:     LeadPriority;
  notes?:        string;
  followUpDate?: string;
  assignedToId?: string;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  status?: LeadStatus;
}

class LeadService {

  async list(
    orgId:       string,
    filters?:    LeadFilters,
    pagination?: { page: number; limit: number },
  ): Promise<PaginatedResult<DbLead>> {
    return leadRepository.findAll(orgId, filters, pagination);
  }

  async get(orgId: string, id: string): Promise<DbLead | null> {
    return leadRepository.findById(orgId, id);
  }

  async create(
    orgId:       string,
    input:       CreateLeadInput,
    createdById: string,
  ): Promise<DbLead> {
    const displayId = await this.nextDisplayId(orgId);

    const createData: LeadCreateData = {
      display_id:        displayId,
      customer_id:       null,
      name:              input.name,
      phone:             input.phone,
      email:             input.email        ?? null,
      source:            input.source,
      destination:       input.destination  ?? null,
      travel_date:       input.travelDate   ?? null,
      return_date:       null,
      pax:               input.pax          ?? 1,
      budget:            input.budget != null ? String(input.budget) : null,
      trip_type:         input.tripType     ?? null,
      status:            'NEW',
      priority:          input.priority     ?? 'MEDIUM',
      notes:             input.notes        ?? null,
      follow_up_date:    input.followUpDate ?? null,
      assigned_to_id:    input.assignedToId ?? null,
      created_by_id:     createdById,
      converted_trip_id: null,
      converted_at:      null,
      converted_by_id:   null,
    };
    const lead = await leadRepository.create(orgId, createData);

    await activityRepository.log(
      orgId, 'lead_created',
      `Lead ${displayId} created — ${input.name}`,
      'lead', lead.id, { userId: createdById },
    );

    return lead;
  }

  async update(
    orgId:       string,
    id:          string,
    input:       UpdateLeadInput,
    updatedById: string,
  ): Promise<DbLead> {
    const patch: LeadUpdateData = {};
    if (input.name         !== undefined) patch.name           = input.name;
    if (input.phone        !== undefined) patch.phone          = input.phone;
    if (input.email        !== undefined) patch.email          = input.email          ?? null;
    if (input.source       !== undefined) patch.source         = input.source;
    if (input.destination  !== undefined) patch.destination    = input.destination    ?? null;
    if (input.travelDate   !== undefined) patch.travel_date    = input.travelDate     ?? null;
    if (input.pax          !== undefined) patch.pax            = input.pax;
    if (input.budget       !== undefined) patch.budget         = input.budget != null ? String(input.budget) : null;
    if (input.tripType     !== undefined) patch.trip_type      = input.tripType       ?? null;
    if (input.status       !== undefined) patch.status         = input.status;
    if (input.priority     !== undefined) patch.priority       = input.priority       ?? null;
    if (input.notes        !== undefined) patch.notes          = input.notes          ?? null;
    if (input.followUpDate !== undefined) patch.follow_up_date = input.followUpDate   ?? null;
    if (input.assignedToId !== undefined) patch.assigned_to_id = input.assignedToId  ?? null;

    const lead = await leadRepository.update(orgId, id, patch);
    await activityRepository.log(orgId, 'lead_updated', 'Lead updated', 'lead', id, { userId: updatedById });
    return lead;
  }

  async setStatus(orgId: string, id: string, status: LeadStatus, userId: string): Promise<DbLead> {
    const lead = await leadRepository.update(orgId, id, { status });
    await activityRepository.log(orgId, 'lead_status', `Lead status → ${status}`, 'lead', id, { userId });
    return lead;
  }

  async delete(orgId: string, id: string, userId: string): Promise<void> {
    await leadRepository.delete(orgId, id);
    await activityRepository.log(orgId, 'lead_deleted', 'Lead deleted', 'lead', id, { userId });
  }

  async countByStatus(orgId: string) {
    return leadRepository.countByStatus(orgId);
  }

  // Use supabase directly — never access repository['supabase'] (protected member)
  private async nextDisplayId(orgId: string): Promise<string> {
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('leads')
      .select('display_id')
      .eq('org_id', orgId)
      .ilike('display_id', `L-${year}-%`)
      .order('display_id', { ascending: false })
      .limit(1);

    const rows = Array.isArray(data) ? data as { display_id: string }[] : [];
    const last  = rows[0]?.display_id ?? null;
    const seq   = last
      ? parseInt(last.split('-')[2] ?? '0', 10) + 1
      : 1;
    return `L-${year}-${String(seq).padStart(4, '0')}`;
  }
}

export const leadService = new LeadService();
