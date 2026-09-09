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
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt'], voiceGender = 'female', roomName = 'PRINCIPAL', isQa = false, qaName = '', detectLanguages = []) {
        this.socket = socket; 
        this.targetLanguages = toLanguages; 
        this.fromLanguage = fromLanguage;
        this.voiceGender = voiceGender;
        this.roomName = roomName;
        this.isActive = true; 
        
        // Q&A Identifiers
        this.isQa = isQa;
        this.qaName = qaName;
        
        this.pushStream = sdk.AudioInputStream.createPushStream();
        
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion) {
            console.error("[!] ADVERTENCIA: Faltan credenciales válidas de Azure");
            return;
        }

        const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
        
        this.isAutoDetect = (detectLanguages && detectLanguages.length > 0);

        if (this.isAutoDetect) {
            // WORKAROUND CRÍTICO: La clase TranslationRecognizer de JS SDK tiene un bug con AutoDetect.
            // Para evitar que colapse, usamos SpeechRecognizer para la detección/transcripción 
            // y luego traducimos manualmente el resultado final vía API REST.
            this.speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
            this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
            this.speechConfig.setProfanity(sdk.ProfanityOption.Masked);
            
            const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(detectLanguages);
            
            this.recognizer = sdk.SpeechRecognizer.FromConfig(this.speechConfig, autoDetectConfig, audioConfig);
            console.log(`[Azure] LID Configurado en SpeechRecognizer para: ${detectLanguages.join(', ')}`);
        } else {
            this.translationConfig = sdk.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
            this.translationConfig.speechRecognitionLanguage = fromLanguage;
            this.translationConfig.setProfanity(sdk.ProfanityOption.Masked);
            
            toLanguages.forEach(lang => {
                this.translationConfig.addTargetLanguage(lang);
            });

            this.recognizer = new sdk.TranslationRecognizer(this.translationConfig, audioConfig);
        }

        this.setupEvents();
    }

    setupEvents() {
        this.recognizer.recognizing = (s, e) => {
            if (!this.isActive) return; 
            try {
                if (e.result.reason === sdk.ResultReason.TranslatingSpeech || e.result.reason === sdk.ResultReason.RecognizingSpeech) {
                    
                    if (e.result.language) {
                        this.fromLanguage = e.result.language;
                    }
                    
                    let translations = {};
                    if (!this.isAutoDetect) {
                        translations = this.extractTranslations(e.result.translations, e.result.text);
                    }
                    
                    const payload = { 
                        type: 'partial', 
                        original: e.result.text, 
                        translations, // En auto-detect enviamos vacío los parciales para ahorrar cuota de API
                        isQa: this.isQa, 
                        qaName: this.qaName 
                    };
                    
                    this.socket.emit('translation-result', payload); 
                    this.socket.broadcast.to(this.roomName).emit('translation-result', payload);
                }
            } catch(error) {
                console.error("[Azure] Error en evento recognizing:", error);
            }
        };

        this.recognizer.recognized = async (s, e) => {
            if (!this.isActive) return;
            try {
                if (e.result.reason === sdk.ResultReason.TranslatedSpeech || e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                    const text = e.result.text;
                    const detectedLang = e.result.language || this.fromLanguage;
                    this.fromLanguage = detectedLang;

                    let translations = {};
                    
                    // Si estamos en Q&A Libre, llamamos a la API de texto para traducir la frase completa detectada
                    if (this.isAutoDetect) {
                        translations = await this.manualTranslate(text, detectedLang);
                    } else {
                        translations = this.extractTranslations(e.result.translations, text);
                    }

                    const payload = { 
                        type: 'final', 
                        original: text, 
                        translations,
                        isQa: this.isQa,
                        qaName: this.qaName
                    };
                    
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
            if (this.isActive) console.warn(`[Azure] Reconocimiento cancelado: ${e.reason}`);
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log(`[Azure] Sesión finalizada nativamente.`);
            this.stop();
        };
    }

    async manualTranslate(text, sourceLangCode) {
        let result = {};
        this.targetLanguages.forEach(l => result[l] = "");
        if (!text) return result;

        const baseLang = sourceLangCode.split('-')[0];
        const toLangs = this.targetLanguages.filter(l => l !== baseLang);
        
        if (this.targetLanguages.includes(baseLang)) {
            result[baseLang] = text;
        }

        if (toLangs.length === 0) return result;

        // Utilizamos la misma API REST robusta del buzón de preguntas
        const key = process.env.AZURE_TRANSLATOR_KEY;
        const region = process.env.AZURE_TRANSLATOR_REGION;

        if (!key || !region) return result;

        try {
            const queryLangs = toLangs.join('&to=');
            const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${baseLang}&to=${queryLangs}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': key,
                    'Ocp-Apim-Subscription-Region': region,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([{ text }])
            });
            
            const data = await response.json();
            if (data && data[0] && data[0].translations) {
                data[0].translations.forEach(t => {
                    result[t.to] = t.text;
                });
            }
        } catch (err) {
            console.error('[Azure Text] Error en manualTranslate:', err);
        }

        return result;
    }

    extractTranslations(translationMap, originalText) {
        let result = {};
        if (!translationMap) return result;
        
        this.targetLanguages.forEach(lang => {
            let translated = translationMap.get(lang);
            const baseFromLang = this.fromLanguage ? this.fromLanguage.split('-')[0] : '';
            if (!translated && baseFromLang === lang) {
                translated = originalText;
            }
            result[lang] = translated;
        });
        return result;
    }

    synthesizeAudio(text, lang) {
        if (!this.isActive) return;
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
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted && this.isActive) {
                        const payload = { 
                            language: lang, 
                            audioBuffer: result.audioData,
                            isQa: this.isQa
                        };
                        this.socket.emit('neural-audio', payload);
                        this.socket.broadcast.to(this.roomName).emit('neural-audio', payload);
                    }
                    synthesizer.close(); 
                },
                error => {
                    if (this.isActive) console.error(`[Azure TTS] Fallo al sintetizar ${lang}: ${error}`);
                    synthesizer.close();
                }
            );
        } catch(e) {
            if (this.isActive) console.error(`[Azure] Error global de síntesis en ${lang}:`, e);
        }
    }

    start() {
        this.isActive = true;
        const prefix = this.isQa ? '[Q&A Público] ' : '';
        console.log(`[Azure] ${prefix}Iniciando motor para sala ${this.roomName}...`);
        if(this.recognizer) {
            try {
                this.recognizer.startContinuousRecognitionAsync();
            } catch(e) {
                console.error(`[Azure] ${prefix}Fallo al iniciar el reconocedor:`, e);
            }
        }
    }

    stop() {
        if (!this.isActive) return; 
        this.isActive = false; 
        
        const prefix = this.isQa ? '[Q&A Público] ' : '';
        console.log(`[Azure] ${prefix}Ejecutando Kill Switch para sala ${this.roomName} (Ahorro de costos activo)`);
        
        try {
            if (this.pushStream) {
                this.pushStream.close();
                this.pushStream = null;
            }

            if (this.recognizer) {
                this.recognizer.stopContinuousRecognitionAsync(
                    () => {
                        if (this.recognizer) {
                            this.recognizer.close();
                            this.recognizer = null;
                        }
                        console.log(`[Azure] ${prefix}Conexión cerrada y memoria liberada.`);
                    },
                    (err) => {
                        console.error(`[Azure] ${prefix}Error al detener reconocedor:`, err);
                        if (this.recognizer) {
                            this.recognizer.close(); 
                            this.recognizer = null;
                        }
                    }
                );
            }
        } catch (e) {
            console.error(`[Azure] ${prefix}Excepción en Kill Switch:`, e);
            if (this.recognizer) {
                try { this.recognizer.close(); } catch(err) {}
                this.recognizer = null;
            }
        }
    }

    writeAudio(data) {
        if (!this.isActive) return; 
        try {
            if (this.pushStream) this.pushStream.write(data);
        } catch (e) {
            // Ignorado silenciosamente
        }
    }
}

module.exports = TranslationService;