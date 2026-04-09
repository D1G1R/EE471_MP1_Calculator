import io
import os
import tempfile

from flask import Flask, jsonify, render_template, request, send_file
from dotenv import load_dotenv

try:
    import azure.cognitiveservices.speech as speechsdk
except Exception:  # pragma: no cover
    speechsdk = None


load_dotenv()

app = Flask(__name__)


def _speech_config():
    if speechsdk is None:
        return None, "azure-cognitiveservices-speech is not installed"
    key = os.getenv("SPEECH_KEY")
    region = os.getenv("SPEECH_REGION")
    if not key or not region:
        return None, "SPEECH_KEY / SPEECH_REGION not set"
    cfg = speechsdk.SpeechConfig(subscription=key, region=region)
    # Commands are in English (Zero..Nine, Plus, Minus, etc.)
    cfg.speech_recognition_language = "en-US"
    return cfg, None


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/tts")
def tts():
    cfg, err = _speech_config()
    if err:
        return jsonify({"error": err}), 400

    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    synthesizer = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    result = synthesizer.speak_text_async(text).get()

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        audio = getattr(result, "audio_data", None)
        if not audio:
            return jsonify({"error": "No audio returned"}), 500
        return send_file(
            io.BytesIO(audio),
            mimetype="audio/wav",
            as_attachment=False,
            download_name="tts.wav",
        )

    if result.reason == speechsdk.ResultReason.Canceled:
        details = result.cancellation_details
        return jsonify({"error": f"TTS canceled: {details.reason}"}), 500

    return jsonify({"error": "TTS failed"}), 500


@app.post("/api/stt")
def stt():
    cfg, err = _speech_config()
    if err:
        return jsonify({"error": err}), 400

    if "audio" not in request.files:
        return jsonify({"error": "audio file is required (multipart/form-data)"}), 400

    f = request.files["audio"]
    data = f.read()
    if not data:
        return jsonify({"error": "empty audio"}), 400

    # Use a real WAV file on disk. Passing full WAV bytes into PushAudioInputStream
    # can lead to format issues and frequent NoMatch ("Speech not recognized").
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        audio_config = speechsdk.audio.AudioConfig(filename=tmp_path)
        recognizer = speechsdk.SpeechRecognizer(speech_config=cfg, audio_config=audio_config)
        result = recognizer.recognize_once_async().get()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return jsonify({"text": result.text})
    if result.reason == speechsdk.ResultReason.NoMatch:
        return jsonify({"error": "Speech not recognized"}), 400
    if result.reason == speechsdk.ResultReason.Canceled:
        details = result.cancellation_details
        return jsonify({"error": f"STT canceled: {details.reason}"}), 500

    return jsonify({"error": "STT failed"}), 500


if __name__ == "__main__":
    app.run(debug=True)
