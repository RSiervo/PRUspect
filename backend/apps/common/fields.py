from rest_framework import serializers


class OwnedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """Only accepts related objects that belong to the requesting user.

    `owner_lookup` is the ORM path from the related model to its owning user.
    Objects owned by someone else are reported as "does not exist".
    """

    def __init__(self, *args, owner_lookup: str = "owner", **kwargs):
        self.owner_lookup = owner_lookup
        super().__init__(*args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return queryset.none()
        return queryset.filter(**{self.owner_lookup: request.user})
