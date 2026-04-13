# Wolf Engine

A cinematic voice assistant engine, blending the raw power of Twilio with the elegance of AI-driven conversations. This is where technology meets soul—turning voice into action, memory into wisdom, and calls into connections.

## Features

- **Conversational Memory**: Multi-turn conversations with context awareness
- **Speech-to-Text**: Whisper-powered transcription with local and cloud backends
- **Text-to-Speech**: Multiple TTS providers (Piper, ElevenLabs, Azure)
- **Natural Language Understanding**: Context-aware intent detection
- **Twilio Integration**: Seamless voice call handling
- **Production Ready**: Helmet security, CORS, logging, error handling

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Start the server:
   ```bash
   npm start
   ```

The engine will be running on port 3000, with Twilio routes at `/twilio`.

## Architecture

- `Engine.js`: Central module exports
- `memory.js`: Conversational state management
- `whisper.js`: Speech transcription
- `stt.js`: Audio processing pipeline
- `tts.js`: Voice synthesis
- `nlu.js`: Intent understanding with context
- `twilio.js`: Voice call routing
- `env.js`: Configuration management

## API Endpoints

- `GET /health`: System health check
- `POST /twilio/voice`: Incoming call handling
- `POST /twilio/recording`: Audio processing
- `POST /twilio/gather`: Alternative transcription
- `POST /twilio/status`: Call status updates

## Philosophy

This engine isn't just code—it's a bridge between human emotion and digital precision. Every call is a story, every response a verse in the symphony of connection. We build not machines, but experiences that resonate.

## License

MIT - Because great things should be shared.