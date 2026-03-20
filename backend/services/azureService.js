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
        
        // ==========================================
        // FILTRO DE LENGUAJE (PROFANITY FILTER)
        // ==========================================
        // Masked: Reemplaza malas palabras con asteriscos (***) y las omite en el audio
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
            if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
                const translations = this.extractTranslations(e.result.translations, e.result.text);
                const payload = { type: 'partial', original: e.result.text, translations };
                
                this.socket.emit('translation-result', payload); 
                this.socket.broadcast.to(this.roomName).emit('translation-result', payload);
            }
        };

        this.recognizer.recognized = (s, e) => {
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
            let translated = translationMap.get(lang);
            if (!translated && this.fromLanguage.startsWith(lang)) {
                translated = originalText;
            }
            result[lang] = translated;
        });
        return result;
    }

    synthesizeAudio(text, lang) {
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
                    console.error(`[Azure TTS] Error en síntesis: ${result.errorDetails}`);
                }
                synthesizer.close(); 
            },
            error => {
                console.error(`[Azure TTS] Fallo al sintetizar ${lang}: ${error}`);
                synthesizer.close();
            }
        );
    }

    start() {
        console.log("[Azure] Iniciando motor de traducción con filtro de lenguaje activo...");
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