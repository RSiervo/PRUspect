"""Small prospect representation shared by other apps (avoids import cycles)."""

from rest_framework import serializers

from .models import Prospect


class ProspectBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Prospect
        fields = ["id", "first_name", "last_name", "preferred_name", "full_name", "status", "priority",
                  "mobile", "email", "is_archived", "is_demo"]
        read_only_fields = fields
