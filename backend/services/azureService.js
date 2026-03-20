const sdk = require("microsoft-cognitiveservices-speech-sdk");

class TranslationService {
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt']) {
        this.socket = socket; 
        this.targetLanguages = toLanguages; // Guardamos los idiomas solicitados dinámicamente
        
        this.pushStream = sdk.AudioInputStream.createPushStream();
        
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion || speechKey === "pega_aqui_tu_clave_de_azure") {
            console.error("[!] ADVERTENCIA: Faltan credenciales válidas de Azure en el archivo .env");
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
                this.socket.emit('translation-result', { 
                    type: 'partial', 
                    original: e.result.text, 
                    translations 
                });
            }
        };

        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
                const translations = this.extractTranslations(e.result.translations);
                this.socket.emit('translation-result', { 
                    type: 'final', 
                    original: e.result.text, 
                    translations 
                });
            }
        };

        this.recognizer.canceled = (s, e) => {
            console.log(`[Azure] Reconocimiento cancelado o error de red: ${e.reason}`);
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log(`[Azure] Sesión detenida.`);
            this.recognizer.stopContinuousRecognitionAsync();
        };
    }

    extractTranslations(translationMap) {
        let result = {};
        // Extraemos dinámicamente todos los idiomas que solicitó el orador
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