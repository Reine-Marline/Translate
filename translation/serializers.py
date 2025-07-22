from rest_framework import serializers
from .models import Event, Language, Interpreter


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'


class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = '__all__'


class InterpreterSerializer(serializers.ModelSerializer):
    language_name = serializers.CharField(source='language.name', read_only=True)

    class Meta:
        model = Interpreter
        fields = ['id', 'name', 'language', 'language_name', 'is_available']
