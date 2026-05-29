import { supabase } from '@/backend/supabase/client';
import { throwRepoError, unwrapList } from './base.repository';
import type { DbActivityLog } from '@/backend/supabase/database.types';
import type { ActivityEntityType } from '@/shared/types';

const TABLE = 'activity_logs';

class ActivityRepository {

  async log(
    orgId:      string,
    type:       string,
    message:    string,
    entityType: ActivityEntityType,
    entityId:   string,
    opts?: { userId?: string; before?: unknown; after?: unknown },
  ): Promise<void> {
    const r = await supabase.from(TABLE).insert({
      org_id:      orgId,
      type,
      message,
      entity_type: entityType,
      entity_id:   entityId,
      user_id:     opts?.userId ?? null,
      before:      opts?.before ?? null,
      after:       opts?.after  ?? null,
      ip_address:  null,
      user_agent:  null,
    });
    if (r.error) console.error('[ActivityLog]', r.error);
  }

  async findByEntity(
    orgId: string, entityType: ActivityEntityType, entityId: string, limit = 50,
  ): Promise<DbActivityLog[]> {
    const r = await supabase.from(TABLE).select('*')
      .eq('org_id', orgId).eq('entity_type', entityType).eq('entity_id', entityId)
      .order('created_at', { ascending: false }).limit(limit);
    return unwrapList<DbActivityLog>(r, TABLE, 'findByEntity');
  }

  async findRecent(orgId: string, limit = 20): Promise<DbActivityLog[]> {
    const r = await supabase.from(TABLE).select('*')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
    return unwrapList<DbActivityLog>(r, TABLE, 'findRecent');
  }
}

export const activityRepository = new ActivityRepository();
