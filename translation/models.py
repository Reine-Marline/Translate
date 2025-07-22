from django.db import models


class Event(models.Model):
    name = models.CharField(max_length=100)
    date = models.DateTimeField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Language(models.Model):
    code = models.CharField(max_length=10, unique=True)  # ex: 'fr', 'en', 'sw'
    name = models.CharField(max_length=50)

    def __str__(self):
        return self.name


class Interpreter(models.Model):
    name = models.CharField(max_length=100)
    language = models.ForeignKey(Language, on_delete=models.CASCADE)
    is_available = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.language.name}"
