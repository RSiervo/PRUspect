from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts import views as accounts
from apps.accounts.admin_views import AdminUserViewSet
from apps.accounts.team_views import TeamView
from apps.activities import views as activities
from apps.dashboard import views as dashboard
from apps.notifications.views import NotificationViewSet
from apps.opportunities import views as opportunities
from apps.prospects import views as prospects
from apps.reports import views as reports

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("prospects", prospects.ProspectViewSet, basename="prospect")
router.register("notes", prospects.ProspectNoteViewSet, basename="note")
router.register("follow-ups", activities.FollowUpViewSet, basename="follow-up")
router.register("activities", activities.ActivityViewSet, basename="activity")
router.register("opportunities", opportunities.OpportunityViewSet, basename="opportunity")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("settings/sources", prospects.ProspectSourceViewSet, basename="source")
router.register("settings/product-categories", prospects.ProductCategoryViewSet, basename="product-category")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("settings/message-templates", activities.MessageTemplateViewSet, basename="message-template")

api_v1 = [
    path("auth/config/", accounts.AuthConfigView.as_view(), name="auth-config"),
    path("auth/login/", accounts.LoginView.as_view(), name="auth-login"),
    path("auth/google/", accounts.GoogleLoginView.as_view(), name="auth-google"),
    path("auth/refresh/", accounts.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", accounts.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", accounts.MeView.as_view(), name="auth-me"),
    path("auth/change-password/", accounts.ChangePasswordView.as_view(), name="auth-change-password"),
    path("team/", TeamView.as_view(), name="team"),
    path("settings/", accounts.SettingsView.as_view(), name="settings"),
    path("settings/demo-data/", prospects.DemoDataView.as_view(), name="settings-demo-data"),
    path("settings/calendar-feed/", accounts.CalendarFeedSettingsView.as_view(), name="settings-calendar-feed"),
    path("dashboard/summary/", dashboard.SummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/today/", dashboard.TodayView.as_view(), name="dashboard-today"),
    path("goals/current/", dashboard.GoalsView.as_view(), name="goals-current"),
    path("dashboard/pipeline/", dashboard.PipelineSummaryView.as_view(), name="dashboard-pipeline"),
    path("dashboard/activity/", dashboard.ActivityFeedView.as_view(), name="dashboard-activity"),
    path("dashboard/performance/", dashboard.PerformanceView.as_view(), name="dashboard-performance"),
    path("pipeline/", opportunities.PipelineView.as_view(), name="pipeline"),
    path("clients/", opportunities.ClientsView.as_view(), name="clients"),
    path("clients/upcoming/", opportunities.ClientsUpcomingView.as_view(), name="clients-upcoming"),
    path("clients/<int:prospect_id>/referral-asked/", opportunities.ReferralAskedView.as_view(), name="client-referral-asked"),
    path("calendar/events/", activities.CalendarEventsView.as_view(), name="calendar-events"),
    path("calendar/feed/<str:token>.ics", activities.CalendarFeedView.as_view(), name="calendar-feed"),
    path("reports/prospects/", reports.ProspectReportView.as_view(), name="report-prospects"),
    path("reports/conversion/", reports.ConversionReportView.as_view(), name="report-conversion"),
    path("reports/pipeline/", reports.PipelineReportView.as_view(), name="report-pipeline"),
    path("reports/activity/", reports.ActivityReportView.as_view(), name="report-activity"),
    path("reports/export/", reports.ReportExportView.as_view(), name="report-export"),
    path("", include(router.urls)),
]


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/v1/", include(api_v1)),
    path("api/health/", health),
    path("django-admin/", admin.site.urls),
]
