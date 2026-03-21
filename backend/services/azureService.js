const sdk = require("microsoft-cognitiveservices-speech-sdk");

const femaleVoiceMap = {
    'es': 'es-CO-SalomeNeural',
    'en': 'en-US-JennyNeural',
    'de': 'de-DE-AmalaNeural',
    'fr': 'fr-FR-DeniseNeural',
    'pt': 'pt-BR-FranciscaNeural'
};

const maleVoiceMap = {
    'es': 'es-CO-GonzaloNeural',
    'en': 'en-US-GuyNeural',
    'de': 'de-DE-ConradNeural',
    'fr': 'fr-FR-HenriNeural',
    'pt': 'pt-BR-AntonioNeural'
};

class TranslationService {
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt'], voiceGender = 'female', roomName = 'PRINCIPAL') {
        this.socket = socket; 
        this.targetLanguages = toLanguages; 
        this.fromLanguage = fromLanguage;
        this.voiceGender = voiceGender;
        this.roomName = roomName;
        
        this.pushStream = sdk.AudioInputStream.createPushStream();
        
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion) {
            console.error("[!] ADVERTENCIA: Faltan credenciales válidas de Azure");
            return;
        }

        this.translationConfig = sdk.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
        this.translationConfig.speechRecognitionLanguage = fromLanguage;
        this.translationConfig.setProfanity(sdk.ProfanityOption.Masked);
        
        toLanguages.forEach(lang => {
            this.translationConfig.addTargetLanguage(lang);
        });

        const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
        this.recognizer = new sdk.TranslationRecognizer(this.translationConfig, audioConfig);

        this.setupEvents();
    }

    setupEvents() {
        this.recognizer.recognizing = (s, e) => {
            try {
                if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
                    const translations = this.extractTranslations(e.result.translations, e.result.text);
                    const payload = { type: 'partial', original: e.result.text, translations };
                    
                    this.socket.emit('translation-result', payload); 
                    this.socket.broadcast.to(this.roomName).emit('translation-result', payload);
                }
            } catch(error) {
                console.error("[Azure] Error en evento recognizing:", error);
            }
        };

        this.recognizer.recognized = (s, e) => {
            try {
                if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
                    const translations = this.extractTranslations(e.result.translations, e.result.text);
                    const payload = { type: 'final', original: e.result.text, translations };
                    
                    this.socket.emit('translation-result', payload);
                    this.socket.broadcast.to(this.roomName).emit('translation-result', payload);

                    this.targetLanguages.forEach(lang => {
                        const textToSpeak = translations[lang];
                        if (textToSpeak && textToSpeak.trim() !== '') {
                            this.synthesizeAudio(textToSpeak, lang);
                        }
                    });
                }
            } catch(error) {
                console.error("[Azure] Error en evento recognized:", error);
            }
        };

        this.recognizer.canceled = (s, e) => {
            console.warn(`[Azure] Reconocimiento cancelado: ${e.reason}`);
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log(`[Azure] Sesión detenida por el servidor.`);
            this.stop();
        };
    }

    extractTranslations(translationMap, originalText) {
        let result = {};
        this.targetLanguages.forEach(lang => {
            let translated = translationMap.get(lang);
            if (!translated && this.fromLanguage.startsWith(lang)) {
                translated = originalText;
            }
            result[lang] = translated;
        });
        return result;
    }

    synthesizeAudio(text, lang) {
        try {
            const speechKey = process.env.AZURE_SPEECH_KEY;
            const speechRegion = process.env.AZURE_SPEECH_REGION;

            const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
            
            const selectedMap = this.voiceGender === 'male' ? maleVoiceMap : femaleVoiceMap;
            speechConfig.speechSynthesisVoiceName = selectedMap[lang] || (this.voiceGender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural');
            speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

            const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

            synthesizer.speakTextAsync(
                text,
                result => {
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                        const payload = { language: lang, audioBuffer: result.audioData };
                        this.socket.emit('neural-audio', payload);
                        this.socket.broadcast.to(this.roomName).emit('neural-audio', payload);
                    } else {
                        console.error(`[Azure TTS] Error en síntesis parcial: ${result.errorDetails}`);
                    }
                    synthesizer.close(); 
                },
                error => {
                    console.error(`[Azure TTS] Fallo crítico al sintetizar ${lang}: ${error}`);
                    synthesizer.close();
                }
            );
        } catch(e) {
            console.error(`[Azure] Error global de síntesis en idioma ${lang}:`, e);
        }
    }

    start() {
        console.log("[Azure] Iniciando motor de traducción...");
        if(this.recognizer) {
            try {
                this.recognizer.startContinuousRecognitionAsync();
            } catch(e) {
                console.error("[Azure] Fallo al iniciar el reconocedor:", e);
            }
        }
    }

    stop() {
        console.log("[Azure] Deteniendo motor y liberando memoria RAM...");
        try {
            if (this.recognizer) {
                this.recognizer.stopContinuousRecognitionAsync(
                    () => {
                        this.recognizer.close();
                        this.recognizer = null;
                    },
                    (err) => {
                        console.error("[Azure] Error al detener reconocedor:", err);
                        this.recognizer = null;
                    }
                );
            }
            if (this.pushStream) {
                this.pushStream.close();
                this.pushStream = null;
            }
        } catch (e) {
            console.error("[Azure] Excepción al liberar recursos:", e);
        }
    }

    writeAudio(data) {
        try {
            if (this.pushStream) this.pushStream.write(data);
        } catch (e) {
            // Ignoramos silenciosamente errores de escritura si el stream ya fue cerrado por latencia
        }
    }
}

module.exports = TranslationService;