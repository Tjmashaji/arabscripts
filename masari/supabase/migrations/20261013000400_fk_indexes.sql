-- فهارس لمفاتيح الربط المستخدمة في البحث والصلاحيات والحذف المتسلسل (توصية مستشار الأداء).
-- أعمدة «أنشأه» (created_by) لا تُقرأ في الاستعلامات، فلم تُفهرس.
create index if not exists attendance_logs_driver_idx on public.attendance_logs (driver_id);
create index if not exists emergency_reports_trip_idx on public.emergency_reports (trip_id);
create index if not exists emergency_reports_driver_idx on public.emergency_reports (driver_id);
create index if not exists notifications_school_idx on public.notifications (school_id);
create index if not exists route_stops_student_idx on public.route_stops (student_id);
create index if not exists routes_bus_idx on public.routes (bus_id);
create index if not exists student_route_assignments_stop_idx on public.student_route_assignments (stop_id);
create index if not exists students_branch_idx on public.students (branch_id);
create index if not exists trip_events_school_idx on public.trip_events (school_id);
create index if not exists trip_events_student_idx on public.trip_events (student_id);
create index if not exists trip_stops_route_stop_idx on public.trip_stops (route_stop_id);
create index if not exists trip_students_trip_stop_idx on public.trip_students (trip_stop_id);
create index if not exists vehicle_locations_driver_idx on public.vehicle_locations (driver_id);
create index if not exists vehicle_locations_bus_idx on public.vehicle_locations (bus_id);
create index if not exists invoices_guardian_idx on public.invoices (guardian_id);
create index if not exists invoices_subscription_idx on public.invoices (subscription_id);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists subscriptions_guardian_idx on public.subscriptions (guardian_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
create index if not exists subscription_plans_school_idx on public.subscription_plans (school_id);
create index if not exists school_claim_requests_user_idx on public.school_claim_requests (user_id);
create index if not exists school_interest_user_idx on public.school_interest (user_id);
create index if not exists ratings_feedback_student_idx on public.ratings_feedback (student_id);
create index if not exists driver_onboarding_requests_driver_idx on public.driver_onboarding_requests (driver_id);
create index if not exists student_onboarding_requests_student_idx on public.student_onboarding_requests (student_id);
create index if not exists student_onboarding_requests_created_by_idx on public.student_onboarding_requests (created_by);
