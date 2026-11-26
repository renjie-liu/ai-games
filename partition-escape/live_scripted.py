"""OFFLINE TEST DOUBLE for the provider side of a Live session. No SDK transport, key or network.

It stands behind `client.aio.live.connect`, so the production worker runs its real receive loop,
tool loop, byte accounting and context updates against it. What the "model" does in a turn is
given by the test; the double only speaks the wire shapes the worker reads.
"""
import asyncio
import json
from types import SimpleNamespace


class Usage:
    def __init__(self, prompt, output, thoughts):
        self.counts = {'prompt_token_count': prompt, 'response_token_count': output, 'thoughts_token_count': thoughts}

    def model_dump(self, **_):
        return dict(self.counts)


def message(**fields):
    return SimpleNamespace(**{'usage_metadata': None, 'go_away': None, 'tool_call_cancellation': None,
                              'tool_call': None, 'server_content': None, **fields})


def content(**fields):
    return SimpleNamespace(**{'interrupted': False, 'model_turn': None, 'input_transcription': None,
                              'output_transcription': None, 'turn_complete': False, **fields})


def audio(seconds):
    """24 kHz 16-bit mono silence of the given length, as one model-turn part."""
    pcm = bytes(int(seconds * 24000) * 2)
    part = SimpleNamespace(thought=False, inline_data=SimpleNamespace(mime_type='audio/pcm;rate=24000', data=pcm))
    return message(server_content=content(model_turn=SimpleNamespace(parts=[part])))


class ScriptedLive:
    """One provider session. `turn(session, prompt)` is the coroutine that plays a model turn."""

    def __init__(self, turn=None):
        self.setup_complete = object()
        self.turn = turn
        self.out = asyncio.Queue()
        self.tool_responses = asyncio.Queue()
        self.sent = []          # every text the worker put on the wire, in order
        self.audio_in = 0       # bytes of player audio received
        self.calls = 0
        self.turns_done = 0
        self.running = None

    # --- what the worker calls -------------------------------------------------
    async def send_client_content(self, turns, turn_complete):
        text = turns['parts'][0]['text']
        self.sent.append(text)
        if turn_complete:
            self.begin(text)

    async def send_realtime_input(self, activity_start=None, activity_end=None, audio=None):
        if audio is not None:
            self.audio_in += len(audio.data)
        if activity_end is not None:
            self.begin(None)

    async def send_tool_response(self, function_responses):
        for response in function_responses:
            await self.tool_responses.put(response.response)

    async def receive(self):
        # Like the SDK: one call yields the messages of one model turn.
        while True:
            item = await self.out.get()
            yield item
            if item.server_content and item.server_content.turn_complete:
                return

    # --- what a scripted turn uses --------------------------------------------
    def begin(self, prompt):
        if self.turn is not None:
            self.running = asyncio.create_task(self.turn(self, prompt))

    def scope(self):
        """The control scope the worker last told the model, read from the wire like a model would."""
        for text in reversed(self.sent):
            if text.startswith('Control scope '):
                return text.split()[2].rstrip('.')
            try:
                data = json.loads(text)
            except ValueError:
                continue
            for key in ('control_scope',):
                if isinstance(data, dict) and key in data:
                    return data[key]
            if isinstance(data, dict) and 'initial_observation' in data:
                return data['initial_observation']['scope']
        raise AssertionError('the worker never sent a control scope')

    async def call(self, name, args):
        self.calls += 1
        call = SimpleNamespace(id=f'scripted-{self.calls}', name=name, args=args)
        await self.out.put(message(tool_call=SimpleNamespace(function_calls=[call])))
        return await self.tool_responses.get()

    async def say(self, seconds):
        await self.out.put(audio(seconds))

    async def complete(self, prompt_tokens=5000, output_tokens=200, thought_tokens=150):
        await self.out.put(message(usage_metadata=Usage(prompt_tokens, output_tokens, thought_tokens)))
        await self.out.put(message(server_content=content(turn_complete=True)))
        self.turns_done += 1


def client_for(session):
    """A stand-in for `genai.Client(...)` whose `aio.live.connect` yields the scripted session."""
    class Connection:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *_):
            return False

    async def aclose():
        return None

    live = SimpleNamespace(connect=lambda model, config: Connection())
    return SimpleNamespace(aio=SimpleNamespace(live=live, aclose=aclose))
