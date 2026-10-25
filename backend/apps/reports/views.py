from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.common.csv_utils import csv_response
from apps.common.timeutils import local_today, parse_date_param
from apps.dashboard import metrics


def _dates(request):
    date_from = parse_date_param(request.query_params.get("date_from"))
    date_to = parse_date_param(request.query_params.get("date_to"))
    if request.query_params.get("date_from") and not date_from:
        raise ValidationError({"date_from": ["Use the YYYY-MM-DD format."]})
    if request.query_params.get("date_to") and not date_to:
        raise ValidationError({"date_to": ["Use the YYYY-MM-DD format."]})
    if date_from and date_to and date_from > date_to:
        raise ValidationError({"date_to": ["End date must be on or after the start date."]})
    return date_from, date_to


class ProspectReportView(APIView):
    def get(self, request):
        return Response(metrics.prospects_report(request.user, *_dates(request)))


class ConversionReportView(APIView):
    def get(self, request):
        return Response(metrics.conversion(request.user, *_dates(request)))


class PipelineReportView(APIView):
    def get(self, request):
        return Response(metrics.pipeline_report(request.user, *_dates(request)))


class ActivityReportView(APIView):
    def get(self, request):
        return Response(metrics.activity_report(request.user, *_dates(request)))


class ReportExportView(APIView):
    """CSV export of one report: ?report=prospects|sources|status|conversion|activity|pipeline."""

    REPORTS = ["acquisition", "sources", "status", "conversion", "activity", "pipeline"]

    def get(self, request):
        report = request.query_params.get("report", "acquisition")
        if report not in self.REPORTS:
            raise ValidationError({"report": [f"Choose one of: {', '.join(self.REPORTS)}."]})
        date_from, date_to = _dates(request)
        user = request.user
        if report in {"acquisition", "sources", "status"}:
            data = metrics.prospects_report(user, date_from, date_to)
            if report == "acquisition":
                header, rows = ["Month", "New Prospects"], [[m["label"], m["count"]] for m in data["acquisition"]]
            elif report == "sources":
                header = ["Source", "Prospects", "Qualified", "Won", "Prospect → Policy %"]
                rows = [[s["source"], s["prospects"], s["qualified"], s["won"], s["conversion_rate"] or ""]
                        for s in data["sources"]]
            else:
                header, rows = ["Status", "Prospects"], [[s["label"], s["count"]] for s in data["by_status"]]
        elif report == "conversion":
            data = metrics.conversion(user, date_from, date_to)
            header = ["Metric", "Rate %", "Numerator", "Denominator", "Definition"]
            rows = [[r["label"], r["rate"] if r["rate"] is not None else "", r["numerator"], r["denominator"],
                     r["definition"]] for r in data["rates"]]
        elif report == "activity":
            data = metrics.activity_report(user, date_from, date_to)
            header = ["Month", "Appointments Scheduled", "Appointments Completed"]
            rows = [[m["label"], m["scheduled"], m["completed"]] for m in data["appointments_by_month"]]
        else:
            data = metrics.pipeline_report(user, date_from, date_to)
            header = ["Opportunity Stage", "Count", "Estimated Annual Premium (PHP)", "Actual Annualized Premium (PHP)"]
            rows = [[s["label"], s["count"], s["estimated_annual_premium"], s["actual_annualized_premium"] or ""]
                    for s in data["by_stage"]]
        record(user=user, action=AuditAction.EXPORT, entity=None, summary=f"Exported {report} report to CSV",
               changes={"report": report, "date_from": str(date_from or ""), "date_to": str(date_to or "")})
        stamp = local_today(user).isoformat()
        return csv_response(f"pruspect-{report}-report-{stamp}.csv", header, rows)
