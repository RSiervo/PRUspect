"""Manager view: totals for the people who report to the current user.

Only aggregate numbers are returned. Managers never receive prospect names,
contact details or notes of their team members.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard import metrics


class TeamView(APIView):
    def get(self, request):
        members = list(request.user.team_members.filter(is_active=True).order_by("first_name", "last_name"))
        if not members:
            raise PermissionDenied("No one reports to you yet.")
        rows = []
        totals = {"prospects": 0, "new_this_month": 0, "follow_ups_today": 0, "overdue": 0, "appointments_week": 0,
                  "policies_this_month": 0}
        for member in members:
            kpis = metrics.summary(member)["kpis"]
            goals = metrics.goal_progress(member)
            row = {
                "id": member.id,
                "full_name": member.full_name,
                "email": member.email,
                "last_login": member.last_login,
                "prospects": kpis["total_prospects"]["value"],
                "new_this_month": kpis["new_this_month"]["value"],
                "follow_ups_today": kpis["follow_ups_today"]["value"],
                "overdue": kpis["overdue_follow_ups"]["value"],
                "appointments_week": kpis["appointments_this_week"]["value"],
                "policies_this_month": kpis["policies_issued"]["this_month"],
                "issued_premium_this_month": goals["actual"]["issued_premium"],
                "conversion_rate": kpis["conversion_rate"]["value"],
            }
            for key in totals:
                totals[key] += row[key] or 0
            rows.append(row)
        return Response({
            "members": rows,
            "totals": totals,
            "note": "Totals only. Team members' prospect details stay private to them.",
        })
