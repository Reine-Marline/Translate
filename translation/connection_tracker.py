from collections import defaultdict
import asyncio

# Dictionnaire de connexions par langue
# ex: { "fr": {channel_name1, channel_name2}, "en": {channel_name3}, ... }
connections_by_language = defaultdict(set)

# Verrou pour les accès concurrents
lock = asyncio.Lock()


def get_connection_count(language_code):
    return len(connections_by_language.get(language_code, set()))
