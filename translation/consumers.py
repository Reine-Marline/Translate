import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .connection_tracker import connections_by_language, lock, get_connection_count


class AudioStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')

        if not user or not user.is_authenticated or not user.is_staff:
            await self.close()
            return

        self.language_code = self.scope['url_route']['kwargs']['language_code']
        self.room_group_name = f"stream_{self.language_code}"
        self.channel_id = self.channel_name

        # Tracker des connexions par langue
        async with lock:
            connections_by_language[self.language_code].add(self.channel_id)

        # Rejoindre le groupe de langue
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.send_connection_update()

        await self.accept()

    async def disconnect(self, close_code):
        # Retirer du tracker
        async with lock:
            connections_by_language[self.language_code].discard(self.channel_id)

        # Quitter le groupe
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        await self.send_connection_update()

    async def receive(self, text_data=None, bytes_data=None):
        # Relayer le flux (audio ou message) aux autres membres du groupe
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'audio_message',
                'text': text_data,
                'bytes': bytes_data,
            }
        )

    async def audio_message(self, event):
        if event['bytes'] is not None:
            await self.send(bytes_data=event['bytes'])
        elif event['text'] is not None:
            await self.send(text_data=event['text'])

    async def send_connection_update(self):
        count = get_connection_count(self.language_code)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'connection_count_update',
                'count': count,
                'language_code': self.language_code
            }
        )

    async def connection_count_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'connection_count',
            'language': event['language'],
            'active_connections': event['count']
        }))
