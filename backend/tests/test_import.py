import io

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditAction, AuditLog
from apps.prospects.models import Prospect

from .helpers import ApiTestCase, make_prospect

CSV = (
    "Full Name,Contact Number,Email,Occupation,Source,Interest,Status,Priority,Birthday\n"
    "Maria Santos,09171234567,maria@example.com,Nurse,Referral,Health; Retirement,Contacted,High,03/15/1990\n"
    "Juan Dela Cruz,0918 765 4321,,Engineer,Facebook Group,Education,New,medium,\n"
    "No Contact,,,,,,,,\n"
    "Maria Again,+63 917 123 4567,,,,,,,\n"
)


def upload(content: bytes, name: str):
    return SimpleUploadedFile(name, content, content_type="application/octet-stream")


class ImportTests(ApiTestCase):
    def preview(self, content=CSV.encode(), name="prospects.csv"):
        return self.client.post("/api/v1/prospects/import/preview/", {"file": upload(content, name)}, format="multipart")

    def test_preview_reads_csv_and_suggests_mapping(self):
        data = self.preview().data
        self.assertEqual(data["headers"][0], "Full Name")
        self.assertEqual(len(data["rows"]), 4)
        mapping = data["suggested_mapping"]
        self.assertEqual(mapping["0"], "full_name")
        self.assertEqual(mapping["1"], "mobile")
        self.assertEqual(mapping["5"], "insurance_interests")

    def test_preview_reads_xlsx(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["First Name", "Last Name", "Mobile"])
        ws.append(["Ana", "Reyes", 9171112222])  # Excel drops the leading zero
        buffer = io.BytesIO()
        wb.save(buffer)
        data = self.preview(buffer.getvalue(), "list.xlsx").data
        self.assertEqual(data["rows"], [["Ana", "Reyes", "9171112222"]])
        self.assertEqual(data["suggested_mapping"], {"0": "first_name", "1": "last_name", "2": "mobile"})

    def test_rejects_unsupported_files(self):
        response = self.preview(b"x", "old.xls")
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.data["errors"])

    def test_validate_flags_invalid_rows_and_duplicates(self):
        data = self.preview().data
        result = self.client.post("/api/v1/prospects/import/validate/", {"rows": data["rows"], "mapping": data["suggested_mapping"]},
                                  format="json").data
        rows = {r["row"]: r for r in result["rows"]}
        self.assertTrue(rows[2]["valid"])
        self.assertTrue(rows[3]["valid"])
        self.assertIn("New source “Facebook Group” will be added to your list.", rows[3]["warnings"])
        self.assertFalse(rows[4]["valid"])  # no last name / contact
        self.assertEqual(rows[5]["duplicate_of"], {"type": "file", "row": 2, "matched_on": "mobile"})
        self.assertEqual(result["summary"], {"total": 4, "valid": 3, "invalid": 1, "duplicates": 1})

    def test_validate_detects_existing_prospects(self):
        existing = make_prospect(self.user, mobile="0917 123 4567")
        data = self.preview().data
        rows = self.client.post("/api/v1/prospects/import/validate/", {"rows": data["rows"], "mapping": data["suggested_mapping"]},
                                format="json").data["rows"]
        self.assertEqual(rows[0]["duplicate_of"], {"type": "existing", "prospect_id": existing.pk, "matched_on": "mobile"})

    def test_import_creates_valid_rows_and_skips_duplicates(self):
        data = self.preview().data
        response = self.client.post("/api/v1/prospects/import/", {"rows": data["rows"], "mapping": data["suggested_mapping"],
                                                                   "skip_duplicates": True}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data, {"created": 2, "skipped_duplicates": 1, "invalid": 1})
        maria = Prospect.objects.get(owner=self.user, first_name="Maria", last_name="Santos")
        self.assertEqual((maria.status, maria.priority, str(maria.birth_date)), ("contacted", "high", "1990-03-15"))
        self.assertEqual(sorted(maria.insurance_interests.values_list("name", flat=True)), ["Health", "Retirement"])
        juan = Prospect.objects.get(owner=self.user, last_name="Dela Cruz")
        self.assertEqual((juan.first_name, juan.source.name, juan.status), ("Juan", "Facebook Group", "new_lead"))
        self.assertTrue(AuditLog.objects.filter(user=self.user, action=AuditAction.PROSPECTS_IMPORTED).exists())
        # Imported prospects belong only to the importer.
        self.assertEqual(self.other_client.get("/api/v1/prospects/").data["count"], 0)

    def test_name_mapping_is_required(self):
        response = self.client.post("/api/v1/prospects/import/validate/", {"rows": [["x"]], "mapping": {"0": "email"}}, format="json")
        self.assertEqual(response.status_code, 400)


class NameSplitTests(ApiTestCase):
    def test_filipino_surname_particles(self):
        from apps.prospects.importer import split_full_name

        self.assertEqual(split_full_name("Juan Dela Cruz"), ("Juan", "Dela Cruz"))
        self.assertEqual(split_full_name("Ma. Teresa De Los Santos"), ("Ma. Teresa", "De Los Santos"))
        self.assertEqual(split_full_name("Jose San Miguel"), ("Jose", "San Miguel"))
        self.assertEqual(split_full_name("Anna Cruz"), ("Anna", "Cruz"))
        self.assertEqual(split_full_name("Cher"), ("Cher", ""))
