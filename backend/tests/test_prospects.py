from apps.activities.services import create_follow_up
from apps.audit.models import AuditAction, AuditLog
from apps.common.csv_utils import safe_cell
from apps.common.normalize import normalize_phone
from apps.prospects.models import Prospect, ProspectStatusHistory

from .helpers import ApiTestCase, in_days, make_prospect


class NormalizeTests(ApiTestCase):
    def test_phone_formats_normalize_to_same_value(self):
        values = {normalize_phone(v) for v in ["09171234567", "+63 917 123 4567", "63-917-123-4567", "9171234567"]}
        self.assertEqual(values, {"639171234567"})

    def test_csv_formula_cells_are_neutralised(self):
        self.assertEqual(safe_cell("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        self.assertEqual(safe_cell("+639"), "'+639")
        self.assertEqual(safe_cell("Maria"), "Maria")


class ProspectCrudTests(ApiTestCase):
    def payload(self, **extra):
        data = {"first_name": "Anna", "last_name": "Cruz", "mobile": "0906 111 2222", "email": "Anna@Example.com",
                "priority": "high"}
        data.update(extra)
        return data

    def test_create_prospect_records_history_and_audit(self):
        category = self.user.product_categories.first()
        response = self.client.post("/api/v1/prospects/", self.payload(insurance_interests=[category.pk]),
                                    format="json")
        self.assertEqual(response.status_code, 201, response.data)
        prospect = Prospect.objects.get(pk=response.data["id"])
        self.assertEqual(prospect.owner, self.user)
        self.assertEqual(prospect.email_normalized, "anna@example.com")
        self.assertEqual(prospect.mobile_normalized, "639061112222")
        self.assertEqual(list(prospect.insurance_interests.all()), [category])
        self.assertEqual(prospect.status_history.count(), 1)
        self.assertTrue(AuditLog.objects.filter(prospect=prospect, action=AuditAction.PROSPECT_CREATED).exists())

    def test_create_with_initial_follow_up(self):
        response = self.client.post("/api/v1/prospects/", self.payload(initial_follow_up={
            "activity_type": "call", "subject": "Intro call", "scheduled_at": in_days(1).isoformat()}), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(response.data["next_follow_up_at"])

    def test_validation_requires_names_and_a_contact_method(self):
        response = self.client.post("/api/v1/prospects/", {"first_name": " ", "last_name": "X"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("first_name", response.data["errors"])
        response = self.client.post("/api/v1/prospects/", {"first_name": "A", "last_name": "B"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("mobile", response.data["errors"])

    def test_invalid_phone_and_future_birth_date(self):
        response = self.client.post("/api/v1/prospects/", self.payload(mobile="12", birth_date="2999-01-01"),
                                    format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("mobile", response.data["errors"])
        self.assertIn("birth_date", response.data["errors"])

    def test_update_records_field_changes(self):
        prospect = make_prospect(self.user)
        response = self.client.patch(f"/api/v1/prospects/{prospect.pk}/", {"occupation": "Engineer"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["occupation"], "Engineer")
        log = AuditLog.objects.get(prospect=prospect, action=AuditAction.PROSPECT_UPDATED)
        self.assertEqual(log.changes["occupation"], ["", "Engineer"])

    def test_status_cannot_be_patched_directly(self):
        prospect = make_prospect(self.user)
        response = self.client.patch(f"/api/v1/prospects/{prospect.pk}/", {"status": "won"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_duplicate_detection_uses_normalized_values(self):
        existing = make_prospect(self.user, mobile="0917 123 4567", email="maria@example.com")
        response = self.client.get("/api/v1/prospects/duplicates/", {"mobile": "+63 917-123-4567"})
        self.assertEqual([m["id"] for m in response.data["matches"]], [existing.pk])
        self.assertEqual(response.data["matches"][0]["matched_on"], ["mobile"])
        response = self.client.get("/api/v1/prospects/duplicates/", {"email": " MARIA@example.com "})
        self.assertEqual(len(response.data["matches"]), 1)
        response = self.client.get("/api/v1/prospects/duplicates/", {"email": "maria@example.com",
                                                                     "exclude": existing.pk})
        self.assertEqual(response.data["matches"], [])

    def test_duplicates_do_not_block_creation(self):
        make_prospect(self.user, mobile="0906 111 2222")
        self.assertEqual(self.client.post("/api/v1/prospects/", self.payload(), format="json").status_code, 201)


class StatusTests(ApiTestCase):
    def change(self, prospect, status, reason=""):
        return self.client.post(f"/api/v1/prospects/{prospect.pk}/change-status/",
                                {"status": status, "reason": reason}, format="json")

    def test_status_change_records_history_and_milestones(self):
        prospect = make_prospect(self.user)
        response = self.change(prospect, "needs_analysis")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "needs_analysis")
        self.assertIsNotNone(response.data["qualified_at"])
        self.assertIsNone(response.data["application_submitted_at"])
        entry = ProspectStatusHistory.objects.filter(prospect=prospect).first()
        self.assertEqual((entry.from_status, entry.to_status, entry.changed_by), ("new_lead", "needs_analysis",
                                                                                  self.user))

    def test_jumping_to_won_stamps_all_milestones(self):
        prospect = make_prospect(self.user)
        data = self.change(prospect, "won").data
        self.assertIsNotNone(data["qualified_at"])
        self.assertIsNotNone(data["application_submitted_at"])
        self.assertIsNotNone(data["policy_issued_at"])

    def test_same_status_rejected(self):
        prospect = make_prospect(self.user)
        self.assertEqual(self.change(prospect, "new_lead").status_code, 400)

    def test_lost_with_reason_and_reopen_is_audited(self):
        prospect = make_prospect(self.user)
        self.change(prospect, "lost", "Budget constraints")
        lost = ProspectStatusHistory.objects.filter(prospect=prospect).first()
        self.assertEqual(lost.reason, "Budget constraints")
        self.change(prospect, "contacted", "Prospect called back")
        reopen = ProspectStatusHistory.objects.filter(prospect=prospect).first()
        self.assertTrue(reopen.is_reopen)
        history = self.client.get(f"/api/v1/prospects/{prospect.pk}/history/").data["status_history"]
        self.assertEqual(len(history), 3)

    def test_archived_prospect_status_locked(self):
        prospect = make_prospect(self.user)
        self.client.post(f"/api/v1/prospects/{prospect.pk}/archive/")
        self.assertEqual(self.change(prospect, "contacted").status_code, 400)


class ArchiveTests(ApiTestCase):
    def test_archive_hides_from_active_list_and_restore_returns_it(self):
        prospect = make_prospect(self.user)
        create_follow_up(user=self.user, prospect=prospect, data={
            "activity_type": "call", "subject": "Call", "scheduled_at": in_days(-2)})
        self.client.post(f"/api/v1/prospects/{prospect.pk}/archive/")
        self.assertEqual(self.client.get("/api/v1/prospects/").data["count"], 0)
        self.assertEqual(self.client.get("/api/v1/prospects/", {"archived": "archived"}).data["count"], 1)
        # Archived prospects don't produce overdue work or metrics; history is kept.
        self.assertEqual(self.client.get("/api/v1/dashboard/summary/").data["kpis"]["overdue_follow_ups"]["value"], 0)
        self.assertEqual(self.client.get(f"/api/v1/prospects/{prospect.pk}/history/").status_code, 200)
        self.client.post(f"/api/v1/prospects/{prospect.pk}/restore/")
        self.assertEqual(self.client.get("/api/v1/prospects/").data["count"], 1)
        actions = set(AuditLog.objects.filter(prospect=prospect).values_list("action", flat=True))
        self.assertTrue({AuditAction.PROSPECT_ARCHIVED, AuditAction.PROSPECT_RESTORED} <= actions)

    def test_permanent_delete_requires_archive_and_name_confirmation(self):
        prospect = make_prospect(self.user)
        url = f"/api/v1/prospects/{prospect.pk}/"
        self.assertEqual(self.client.delete(url, {"confirm_name": "Maria Santos"}, format="json").status_code, 400)
        self.client.post(url + "archive/")
        self.assertEqual(self.client.delete(url, {"confirm_name": "wrong"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(url, {"confirm_name": "maria santos"}, format="json").status_code, 204)
        self.assertFalse(Prospect.objects.filter(pk=prospect.pk).exists())
        log = AuditLog.objects.get(action=AuditAction.PROSPECT_DELETED)
        self.assertNotIn("Maria", log.summary)


class ListingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.a = make_prospect(self.user, first_name="Alpha", last_name="Zed", mobile="0917 000 0001",
                               email="a@example.com", priority="low", company="Acme")
        self.b = make_prospect(self.user, first_name="Bravo", last_name="Young", mobile="0917 000 0002",
                               email="b@example.com", priority="high")
        self.c = make_prospect(self.user, first_name="Charlie", last_name="Xu", mobile="0917 000 0003",
                               email="c@example.com", priority="medium", status="contacted")
        create_follow_up(user=self.user, prospect=self.c, data={"activity_type": "call", "subject": "s",
                                                                 "scheduled_at": in_days(1)})
        create_follow_up(user=self.user, prospect=self.a, data={"activity_type": "call", "subject": "s",
                                                                 "scheduled_at": in_days(3)})

    def ids(self, **params):
        return [p["id"] for p in self.client.get("/api/v1/prospects/", params).data["results"]]

    def test_search_by_name_company_email_and_phone(self):
        self.assertEqual(self.ids(search="bravo"), [self.b.pk])
        self.assertEqual(self.ids(search="acme"), [self.a.pk])
        self.assertEqual(self.ids(search="c@example"), [self.c.pk])
        self.assertEqual(self.ids(search="+63 917 000 0002"), [self.b.pk])

    def test_filters(self):
        self.assertEqual(self.ids(status="contacted"), [self.c.pk])
        self.assertEqual(set(self.ids(priority="high,low")), {self.a.pk, self.b.pk})

    def test_sorting(self):
        self.assertEqual(self.ids(ordering="name"), [self.c.pk, self.b.pk, self.a.pk])
        self.assertEqual(self.ids(ordering="priority"), [self.b.pk, self.c.pk, self.a.pk])
        # Prospects without a follow-up sort last.
        self.assertEqual(self.ids(ordering="next_follow_up_at"), [self.c.pk, self.a.pk, self.b.pk])

    def test_pagination(self):
        page = self.client.get("/api/v1/prospects/", {"page_size": 2, "page": 2, "ordering": "name"}).data
        self.assertEqual(page["count"], 3)
        self.assertEqual(page["total_pages"], 2)
        self.assertEqual([p["id"] for p in page["results"]], [self.a.pk])

    def test_export_respects_filters_and_is_audited(self):
        response = self.client.get("/api/v1/prospects/export/", {"priority": "high"})
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        body = response.content.decode("utf-8-sig")
        self.assertIn("Bravo", body)
        self.assertNotIn("Alpha", body)
        self.assertTrue(AuditLog.objects.filter(action=AuditAction.EXPORT, user=self.user).exists())

    def test_bulk_set_priority(self):
        response = self.client.post("/api/v1/prospects/bulk/", {"ids": [self.a.pk, self.b.pk],
                                                                 "action": "set_priority", "value": "high"},
                                    format="json")
        self.assertEqual(response.data, {"updated": 1, "skipped": 1, "not_found": 0})

    def test_notes_keep_revisions(self):
        note = self.client.post("/api/v1/notes/", {"prospect": self.a.pk, "body": "First"}, format="json").data
        edited = self.client.patch(f"/api/v1/notes/{note['id']}/", {"body": "Second"}, format="json").data
        self.assertTrue(edited["is_edited"])
        self.assertEqual(edited["revisions"][0]["previous_body"], "First")
        self.assertEqual(self.client.delete(f"/api/v1/notes/{note['id']}/").status_code, 405)


class MilestoneFilterTests(ApiTestCase):
    def test_milestone_filter_uses_first_reached_timestamps(self):
        from apps.prospects.services import change_status

        qualified = make_prospect(self.user, first_name="Q")
        won = make_prospect(self.user, first_name="W", mobile="0917 222 3333")
        make_prospect(self.user, first_name="N", mobile="0917 222 4444")
        change_status(user=self.user, prospect=qualified, new_status="needs_analysis")
        change_status(user=self.user, prospect=qualified, new_status="lost")  # milestone is kept
        change_status(user=self.user, prospect=won, new_status="won")

        def names(milestone):
            data = self.client.get("/api/v1/prospects/", {"milestone": milestone}).data["results"]
            return sorted(p["first_name"] for p in data)

        self.assertEqual(names("qualified"), ["Q", "W"])
        self.assertEqual(names("application"), ["W"])
        self.assertEqual(names("won"), ["W"])
