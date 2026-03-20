const sdk = require("microsoft-cognitiveservices-speech-sdk");

// ==========================================
// NUEVO: MAPA DE VOCES NEURONALES PREMIUM
// ==========================================
// Seleccionadas por su naturalidad, dicción y tono corporativo
const voiceMap = {
    'es': 'es-CO-SalomeNeural',   // Voz Premium Colombiana
    'en': 'en-US-JennyNeural',    // Voz Premium Americana (Estándar de la industria)
    'de': 'de-DE-AmalaNeural',    // Voz Premium Alemana
    'fr': 'fr-FR-DeniseNeural',   // Voz Premium Francesa
    'pt': 'pt-BR-FranciscaNeural' // Voz Premium Brasileña
};

class TranslationService {
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt']) {
        this.socket = socket; 
        this.targetLanguages = toLanguages; 
        this.fromLanguage = fromLanguage; // Guardamos el idioma base
        
        this.pushStream = sdk.AudioInputStream.createPushStream();
        
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion) {
            console.error("[!] ADVERTENCIA: Faltan credenciales válidas de Azure");
            return;
        }

        this.translationConfig = sdk.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
        this.translationConfig.speechRecognitionLanguage = fromLanguage;
        
        toLanguages.forEach(lang => {
            this.translationConfig.addTargetLanguage(lang);
        });

        const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
        this.recognizer = new sdk.TranslationRecognizer(this.translationConfig, audioConfig);

        this.setupEvents();
    }

    setupEvents() {
        this.recognizer.recognizing = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
                const translations = this.extractTranslations(e.result.translations, e.result.text);
                const payload = { type: 'partial', original: e.result.text, translations };
                
                // 1. Enviamos el texto al administrador (tu PC)
                this.socket.emit('translation-result', payload); 
                
                // 2. TRANSMISIÓN GLOBAL: Enviamos el texto a toda la audiencia (Celulares)
                this.socket.broadcast.emit('translation-result', payload);
            }
        };

        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
                const translations = this.extractTranslations(e.result.translations, e.result.text);
                const payload = { type: 'final', original: e.result.text, translations };
                
                // Enviamos a ambos
                this.socket.emit('translation-result', payload);
                this.socket.broadcast.emit('translation-result', payload);

                // ==========================================
                // NUEVO: SÍNTESIS DE VOZ NEURONAL (TTS)
                // ==========================================
                // Por cada frase final, pedimos a Azure el audio premium en todos los idiomas
                this.targetLanguages.forEach(lang => {
                    const textToSpeak = translations[lang];
                    if (textToSpeak && textToSpeak.trim() !== '') {
                        this.synthesizeAudio(textToSpeak, lang);
                    }
                });
            }
        };

        this.recognizer.canceled = (s, e) => {
            console.log(`[Azure] Reconocimiento cancelado: ${e.reason}`);
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log(`[Azure] Sesión detenida.`);
            this.recognizer.stopContinuousRecognitionAsync();
        };
    }

    extractTranslations(translationMap, originalText) {
        let result = {};
        this.targetLanguages.forEach(lang => {
            // Truco inteligente: Si Azure no "traduce" el español porque es el idioma origen,
            // interceptamos la variable y le pegamos el texto original para que la voz no se quede muda.
            let translated = translationMap.get(lang);
            if (!translated && this.fromLanguage.startsWith(lang)) {
                translated = originalText;
            }
            result[lang] = translated;
        });
        return result;
    }

    // ==========================================
    // NUEVO: MOTOR GENERADOR DE AUDIO WEB
    // ==========================================
    synthesizeAudio(text, lang) {
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        
        // Asignamos la voz corporativa del diccionario
        speechConfig.speechSynthesisVoiceName = voiceMap[lang] || 'en-US-JennyNeural';

        // 'null' evita que Node.js intente reproducir el sonido en la nube
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

        synthesizer.speakTextAsync(
            text,
            result => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    // Empaquetamos el ArrayBuffer puro
                    const payload = { language: lang, audioBuffer: result.audioData };
                    
                    // Disparamos el audio por los "tubos" hacia los celulares
                    this.socket.emit('neural-audio', payload);
                    this.socket.broadcast.emit('neural-audio', payload);
                } else {
                    console.error(`[Azure TTS] Error sintetizando voz para ${lang}: ${result.errorDetails}`);
                }
                // Liberar memoria RAM del servidor de Render
                synthesizer.close(); 
            },
            error => {
                console.error(`[Azure TTS] Fallo al sintetizar ${lang}: ${error}`);
                synthesizer.close();
            }
        );
    }

    start() {
        console.log("[Azure] Iniciando motor de traducción continua...");
        if(this.recognizer) this.recognizer.startContinuousRecognitionAsync();
    }

    stop() {
        console.log("[Azure] Deteniendo motor de traducción...");
        if(this.recognizer) this.recognizer.stopContinuousRecognitionAsync();
        if(this.pushStream) this.pushStream.close();
    }

    writeAudio(data) {
        if(this.pushStream) this.pushStream.write(data);
    }
}

module.exports = TranslationService;