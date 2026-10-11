-- إغلاق صلاحية الزائر غير المسجّل على جداول دليل المدارس (RLS كانت تمنع القراءة أصلًا).
revoke all on table public.school_interest, public.school_claim_requests, public.school_admin_invites from anon;
