from urllib.parse import parse_qs
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.authentication import JWTAuthentication
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from jwt import InvalidTokenError

User = get_user_model()


@database_sync_to_async
def get_user(token):
    try:
        validated_token = UntypedToken(token)
        return JWTAuthentication().get_user(validated_token)
    except InvalidTokenError:
        return AnonymousUser()


class JWTAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    def __call__(self, scope):
        query_string = parse_qs(scope["query_string"].decode())
        token = query_string.get("token", [None])[0]
        scope['user'] = AnonymousUser()

        if token:
            return get_user(token).then(
                lambda user: self.inner({**scope, 'user': user})
            )
        return self.inner(scope)
