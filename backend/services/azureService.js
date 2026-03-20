const sdk = require("microsoft-cognitiveservices-speech-sdk");

class TranslationService {
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt']) {
        this.socket = socket; 
        this.targetLanguages = toLanguages; 
        
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
                const translations = this.extractTranslations(e.result.translations);
                const payload = { type: 'partial', original: e.result.text, translations };
                
                // 1. Enviamos el texto al administrador (tu PC)
                this.socket.emit('translation-result', payload); 
                
                // 2. TRANSMISIÓN GLOBAL: Enviamos el texto a toda la audiencia (Celulares)
                this.socket.broadcast.emit('translation-result', payload);
            }
        };

        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
                const translations = this.extractTranslations(e.result.translations);
                const payload = { type: 'final', original: e.result.text, translations };
                
                // Enviamos a ambos
                this.socket.emit('translation-result', payload);
                this.socket.broadcast.emit('translation-result', payload);
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

    extractTranslations(translationMap) {
        let result = {};
        this.targetLanguages.forEach(lang => {
            result[lang] = translationMap.get(lang);
        });
        return result;
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