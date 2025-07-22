from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .connection_tracker import get_connection_count
from .models import Event, Language, Interpreter
from .serializers import EventSerializer, LanguageSerializer, InterpreterSerializer


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer


class LanguageViewSet(viewsets.ModelViewSet):
    queryset = Language.objects.all()
    serializer_class = LanguageSerializer


class InterpreterViewSet(viewsets.ModelViewSet):
    queryset = Interpreter.objects.select_related('language').all()
    serializer_class = InterpreterSerializer


@api_view(['GET'])
def connections_count(request, lang_code):
    count = get_connection_count(lang_code)
    return Response({'language': lang_code, 'active_connections': count})
