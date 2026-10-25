from django.apps import AppConfig


class MonitoringConfig(AppConfig):
    name = "apps.monitoring"
    label = "monitoring"

    def ready(self) -> None:
        from django.core.signals import got_request_exception

        from .signals import on_request_exception

        got_request_exception.connect(on_request_exception, dispatch_uid="monitoring_capture")
