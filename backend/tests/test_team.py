from rest_framework.test import APIClient

from .helpers import ApiTestCase, make_prospect, make_user


class TeamTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_user("admin@example.com", is_staff=True)
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)
        # self.user will manage self.other
        make_prospect(self.other, first_name="Confidential", last_name="Client", email="c@example.com")

    def assign(self, member, manager_id):
        return self.admin_client.post(f"/api/v1/admin/users/{member.pk}/manager/", {"manager_id": manager_id}, format="json")

    def test_manager_sees_totals_but_not_prospect_details(self):
        self.assertEqual(self.client.get("/api/v1/team/").status_code, 403)  # nobody reports yet
        self.assertEqual(self.assign(self.other, self.user.pk).status_code, 200)
        data = self.client.get("/api/v1/team/").data
        self.assertEqual([m["email"] for m in data["members"]], ["other@example.com"])
        self.assertEqual(data["members"][0]["prospects"], 1)
        self.assertNotIn("Confidential", str(data))
        # The team member can't see the manager's team, and still can't see others' prospects.
        self.assertEqual(self.other_client.get("/api/v1/team/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/prospects/").data["count"], 0)

    def test_me_shows_manager_and_team_size(self):
        self.assign(self.other, self.user.pk)
        self.other.refresh_from_db()
        self.other_client.force_authenticate(self.other)  # real requests load the user fresh from the database
        self.assertEqual(self.other_client.get("/api/v1/auth/me/").data["manager"]["email"], "owner@example.com")
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["team_size"], 1)

    def test_loops_and_self_management_are_blocked(self):
        self.assertEqual(self.assign(self.user, self.user.pk).status_code, 400)
        self.assign(self.other, self.user.pk)
        self.assertEqual(self.assign(self.user, self.other.pk).status_code, 400)
        self.assertEqual(self.assign(self.other, None).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/team/").status_code, 403)

    def test_only_admins_assign_managers(self):
        response = self.client.post(f"/api/v1/admin/users/{self.other.pk}/manager/", {"manager_id": self.user.pk}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_inactive_members_are_hidden(self):
        self.assign(self.other, self.user.pk)
        self.other.is_active = False
        self.other.save()
        self.assertEqual(self.client.get("/api/v1/team/").status_code, 403)
