import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, AlertCircle, MessageSquare, Radio, PowerOff, Key, LogOut, QrCode, X, Scale, RefreshCw, Hand, Mic, Keyboard, Square } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const getDeviceId = () => {
    let id = localStorage.getItem('audienceDeviceId');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('audienceDeviceId', id);
    }
    return id;
};

// DICCIONARIO MULTILINGÜE PARA LA INTERFAZ (Textos legales restaurados y traducidos)
const uiTranslations = {
  es: {
    exit: "Salir",
    close: "Cerrar",
    subtitlesOnly: "Solo Subtítulos",
    silentReading: "Lectura silenciosa en pantalla",
    audioOnly: "Solo Audio",
    headphonesReq: "Requiere uso de audífonos",
    targetLang: "Idioma de traducción",
    waitingSpeaker: "Esperando al orador...",
    neuralAudioActive: "Audio neuronal activo",
    transcriptionPaused: "La transcripción visual está pausada para maximizar el rendimiento.",
    requestFloorBtn1: "Pedir",
    requestFloorBtn2: "Palabra",
    writtenQuestionBtn1: "Pregunta",
    writtenQuestionBtn2: "Escrita",
    status: "Estado",
    waitingQueue: "En fila de espera...",
    broadcasting: "Transmitiendo",
    micActive: "¡Tu micrófono está activo!",
    endIntervention: "Terminar mi intervención",
    switchToAudio: "Cambiar a Modo Audio",
    switchToText: "Cambiar a Modo Texto",
    projectedQuestion: "Pregunta Proyectada",
    askQuestion: "Hacer una Pregunta",
    liveVoiceText: "Identifícate para que el moderador pueda darte paso y encender tu micrófono.",
    mailboxText: "Envía tu pregunta al buzón del orador. Si es seleccionada, se proyectará para todos.",
    yourName: "Tu Nombre",
    location: "Ubicación (Ej. Fila 4)",
    writeQuestionHere: "Escribe aquí tu pregunta...",
    listening: "Escuchando... Haz clic en el botón rojo para detener.",
    sendToMailbox: "Enviar al Buzón",
    notSupported: "No Soportado",
    notSupportedText: "Tu navegador no soporta el dictado nativo. Por favor, utiliza el teclado.",
    sent: "¡Enviada!",
    sentText: "Tu pregunta ha sido enviada al orador.",
    permissionDenied: "Permiso Denegado",
    permissionDeniedText: "Para hablar necesitas permitir el acceso al micrófono de tu dispositivo.",
    privacy: "Privacidad",
    terms: "Términos",
    cookies: "Cookies",
    translationPlatform: "Plataforma de Traducción",
    room: "SALA:",
    liveTranslation: "Traducción en Vivo",
    enterCode: "Ingresa el código manual o escanea el QR de tu sala para acceder.",
    roomCode: "Código de Sala",
    scanQR: "Escanear QR",
    enterRoom: "Ingresar a la Sala",
    validating: "Validando sala...",
    syncing: "Sincronizando...",
    reconnect: "Reconectar",
    backToMenu: "Salir al menú principal",
    roomPaused: "Sala Pausada",
    roomPausedText: "El sistema o esta sala se encuentra inactiva en este momento. Por favor, espera a que se reanude.",
    scanToJoin: "Escanear Acceso",
    pointCamera: "Apunta la cámara al código QR de tu sala para ingresar automáticamente.",
    cancel: "Cancelar",
    confirm: "Confirmar",
    understood: "Entendido",
    exitPrompt: "¿Deseas desconectarte y volver al menú principal?",
    // TEXTOS LEGALES RESTAURADOS
    privacy1Title: "1. Captura y Procesamiento de Voz:",
    privacy1Desc: "La plataforma utiliza el micrófono del dispositivo emisor exclusivamente para capturar la voz durante la sesión activa. El audio se transmite en tiempo real mediante canales cifrados a servidores de procesamiento automatizado de terceros con certificación de seguridad corporativa para generar la traducción y síntesis de voz neuronal.",
    privacy2Title: "2. Almacenamiento No Persistente:",
    privacy2Desc: "Las transmisiones de audio son efímeras. No almacenamos, grabamos ni guardamos copias de voz de los oradores ni de la audiencia en bases de datos a largo plazo.",
    privacy3Title: "3. Telemetría y Analíticas:",
    privacy3Desc: "Recopilamos información analítica anónima, como el recuento de usuarios por sala y los idiomas seleccionados, para proporcionar métricas de calidad al organizador del evento. No se recopilan datos de identificación personal sin consentimiento.",
    privacy4Title: "4. Marco Normativo:",
    privacy4Desc: "Este tratamiento se realiza garantizando el cumplimiento de los estándares de protección de datos vigentes aplicables a entornos institucionales y corporativos.",
    terms1Title: "1. Uso del Servicio:",
    terms1Desc: "Esta plataforma se proporciona \"tal cual\" como una herramienta de asistencia en tiempo real para eventos en vivo. El usuario se compromete a no utilizar el sistema para fines ilícitos o que interfieran con la transmisión tecnológica del evento.",
    terms2Title: "2. Propiedad Intelectual:",
    terms2Desc: "El diseño de la interfaz y la marca blanca mostrada pertenecen al organizador del evento o a la entidad licenciante. Queda prohibida su reproducción o distribución sin autorización expresa.",
    terms3Title: "3. Naturaleza de la Traducción:",
    terms3Desc: "La plataforma proporciona traducciones generadas de forma automática en tiempo real para facilitar la comprensión general. Debido a la naturaleza del procesamiento automatizado y el lenguaje hablado, pueden presentarse variaciones, omisiones o inexactitudes con respecto al mensaje original. Este servicio está diseñado como soporte comunicativo y no constituye ni sustituye una traducción humana certificada.",
    terms4Title: "4. Disponibilidad:",
    terms4Desc: "Al ser un sistema que depende de conexiones de red y proveedores en la nube, el servicio puede presentar latencia o interrupciones inherentes a la infraestructura de internet local del usuario.",
    cookies1Title: "1. Cookies Técnicas Estrictamente Necesarias:",
    cookies1Desc: "Utilizamos tecnologías de almacenamiento local en su navegador (SessionStorage, LocalStorage y cachés de Service Workers para Aplicaciones Web Progresivas) exclusivamente para garantizar el funcionamiento técnico de la aplicación (ej. mantener su sesión activa en una sala, recordar su idioma de preferencia y cargar la interfaz rápidamente ante cortes de red).",
    cookies2Title: "2. Ausencia de Rastreadores de Publicidad:",
    cookies2Desc: "No implementamos cookies de terceros con fines publicitarios, de marketing cruzado ni de venta de perfiles de navegación. Nuestra plataforma está diseñada desde el principio bajo el principio de privacidad por diseño (Privacy by Design).",
    cookies3Title: "3. Gestión del Usuario:",
    cookies3Desc: "Al hacer clic en \"Salir del evento\" o utilizar el botón de desconexión, el sistema limpia activamente el rastro de su sesión de las salas en memoria."
  },
  en: {
    exit: "Leave",
    close: "Close",
    subtitlesOnly: "Subtitles Only",
    silentReading: "Silent reading on screen",
    audioOnly: "Audio Only",
    headphonesReq: "Headphones required",
    targetLang: "Traslation Language",
    waitingSpeaker: "Waiting for the speaker...",
    neuralAudioActive: "Neural audio active",
    transcriptionPaused: "Visual transcription is paused to maximize performance.",
    requestFloorBtn1: "Request",
    requestFloorBtn2: "Floor",
    writtenQuestionBtn1: "Written",
    writtenQuestionBtn2: "Question",
    status: "Status",
    waitingQueue: "Waiting in queue...",
    broadcasting: "Broadcasting",
    micActive: "Your microphone is active!",
    endIntervention: "End my intervention",
    switchToAudio: "Switch to Audio Mode",
    switchToText: "Switch to Text Mode",
    projectedQuestion: "Projected Question",
    askQuestion: "Ask a Question",
    liveVoiceText: "Identify yourself so the moderator can give you the floor and turn on your microphone.",
    mailboxText: "Send your question to the speaker's mailbox. If selected, it will be projected for everyone.",
    yourName: "Your Name",
    location: "Location (e.g., Row 4)",
    writeQuestionHere: "Write your question here...",
    listening: "Listening... Click the red button to stop.",
    sendToMailbox: "Send to Mailbox",
    notSupported: "Not Supported",
    notSupportedText: "Your browser does not support native dictation. Please use the keyboard.",
    sent: "Sent!",
    sentText: "Your question has been sent to the speaker.",
    permissionDenied: "Permission Denied",
    permissionDeniedText: "To speak, you need to allow microphone access on your device.",
    privacy: "Privacy",
    terms: "Terms",
    cookies: "Cookies",
    translationPlatform: "Translation Platform",
    room: "ROOM:",
    liveTranslation: "Live Translation",
    enterCode: "Enter the manual code or scan your room's QR to access.",
    roomCode: "Room Code",
    scanQR: "Scan QR",
    enterRoom: "Enter Room",
    validating: "Validating room...",
    syncing: "Syncing...",
    reconnect: "Reconnect",
    backToMenu: "Back to main menu",
    roomPaused: "Room Paused",
    roomPausedText: "The system or this room is currently inactive. Please wait for it to resume.",
    scanToJoin: "Scan to Join",
    pointCamera: "Point your camera at your room's QR code to enter automatically.",
    cancel: "Cancel",
    confirm: "Confirm",
    understood: "Understood",
    exitPrompt: "Do you want to disconnect and return to the main menu?",
    privacy1Title: "1. Voice Capture and Processing:",
    privacy1Desc: "The platform uses the emitting device's microphone exclusively to capture voice during the active session. Audio is transmitted in real time via encrypted channels to third-party automated processing servers with corporate security certification to generate translation and neural speech synthesis.",
    privacy2Title: "2. Non-Persistent Storage:",
    privacy2Desc: "Audio transmissions are ephemeral. We do not store, record, or keep voice copies of speakers or the audience in long-term databases.",
    privacy3Title: "3. Telemetry and Analytics:",
    privacy3Desc: "We collect anonymous analytical information, such as the count of users per room and selected languages, to provide quality metrics to the event organizer. Personally identifiable data is not collected without consent.",
    privacy4Title: "4. Regulatory Framework:",
    privacy4Desc: "This processing is carried out guaranteeing compliance with current data protection standards applicable to institutional and corporate environments.",
    terms1Title: "1. Use of the Service:",
    terms1Desc: "This platform is provided \"as is\" as a real-time assistance tool for live events. The user agrees not to use the system for illegal purposes or to interfere with the event's technological transmission.",
    terms2Title: "2. Intellectual Property:",
    terms2Desc: "The interface design and the white label shown belong to the event organizer or the licensing entity. Its reproduction or distribution without express authorization is prohibited.",
    terms3Title: "3. Nature of the Translation:",
    terms3Desc: "The platform provides automatically generated real-time translations to facilitate general understanding. Due to the nature of automated processing and spoken language, variations, omissions, or inaccuracies may occur regarding the original message. This service is designed as communicative support and does not constitute or replace a certified human translation.",
    terms4Title: "4. Availability:",
    terms4Desc: "As a system that depends on network connections and cloud providers, the service may present latency or interruptions inherent to the user's local internet infrastructure.",
    cookies1Title: "1. Strictly Necessary Technical Cookies:",
    cookies1Desc: "We use local storage technologies in your browser (SessionStorage, LocalStorage, and Service Worker caches for Progressive Web Apps) exclusively to guarantee the application's technical operation (e.g., keeping your session active in a room, remembering your preferred language, and loading the interface quickly in case of network cuts).",
    cookies2Title: "2. Absence of Advertising Trackers:",
    cookies2Desc: "We do not implement third-party cookies for advertising, cross-marketing, or selling browsing profiles. Our platform is designed from the ground up under the Privacy by Design principle.",
    cookies3Title: "3. User Management:",
    cookies3Desc: "By clicking \"Leave event\" or using the disconnect button, the system actively clears your session trace from memory rooms."
  },
  pt: {
    exit: "Sair",
    close: "Fechar",
    subtitlesOnly: "Apenas Legendas",
    silentReading: "Leitura silenciosa na tela",
    audioOnly: "Apenas Áudio",
    headphonesReq: "Requer uso de fones de ouvido",
    targetLang: "Idioma de destino",
    waitingSpeaker: "Aguardando o orador...",
    neuralAudioActive: "Áudio neural ativo",
    transcriptionPaused: "A transcrição visual está pausada para maximizar o desempenho.",
    requestFloorBtn1: "Pedir",
    requestFloorBtn2: "Palavra",
    writtenQuestionBtn1: "Pergunta",
    writtenQuestionBtn2: "Escrita",
    status: "Status",
    waitingQueue: "Na fila de espera...",
    broadcasting: "Transmitindo",
    micActive: "Seu microfone está ativo!",
    endIntervention: "Encerrar minha intervenção",
    switchToAudio: "Mudar para Modo Áudio",
    switchToText: "Mudar para Modo Texto",
    projectedQuestion: "Pergunta Projetada",
    askQuestion: "Fazer uma Pergunta",
    liveVoiceText: "Identifique-se para que o moderador possa lhe dar a palavra e ligar seu microfone.",
    mailboxText: "Envie sua pergunta para a caixa de entrada do orador. Se selecionada, será projetada.",
    yourName: "Seu Nome",
    location: "Localização",
    writeQuestionHere: "Escreva sua pergunta aqui...",
    listening: "Ouvindo... Clique no botão vermelho para parar.",
    sendToMailbox: "Enviar para Caixa",
    notSupported: "Não Suportado",
    notSupportedText: "Seu navegador não suporta ditado nativo. Por favor, use o teclado.",
    sent: "Enviado!",
    sentText: "Sua pergunta foi enviada ao orador.",
    permissionDenied: "Permissão Negada",
    permissionDeniedText: "Para falar, você precisa permitir o acesso ao microfone no seu dispositivo.",
    privacy: "Privacidade",
    terms: "Termos",
    cookies: "Cookies",
    translationPlatform: "Plataforma de Tradução",
    room: "SALA:",
    liveTranslation: "Tradução ao Vivo",
    enterCode: "Insira o código ou escaneie o QR da sua sala.",
    roomCode: "Código da Sala",
    scanQR: "Escanear QR",
    enterRoom: "Entrar na Sala",
    validating: "Validando sala...",
    syncing: "Sincronizando...",
    reconnect: "Reconectar",
    backToMenu: "Sair para o menu principal",
    roomPaused: "Sala Pausada",
    roomPausedText: "O sistema ou esta sala está inativo no momento. Por favor, aguarde.",
    scanToJoin: "Escanear Acesso",
    pointCamera: "Aponte a câmera para o código QR da sua sala para entrar.",
    cancel: "Cancelar",
    confirm: "Confirmar",
    understood: "Entendido",
    exitPrompt: "Deseja desconectar e voltar ao menu?",
    privacy1Title: "1. Captura e Processamento de Voz:",
    privacy1Desc: "A plataforma utiliza o microfone do dispositivo emissor exclusivamente para capturar a voz durante a sessão ativa. O áudio é transmitido em tempo real através de canais criptografados para servidores de processamento automatizado de terceiros com certificação de segurança corporativa para gerar tradução e síntese de fala neural.",
    privacy2Title: "2. Armazenamento Não Persistente:",
    privacy2Desc: "As transmissões de áudio são efêmeras. Não armazenamos, gravamos ou mantemos cópias de voz dos oradores ou do público em bancos de dados de longo prazo.",
    privacy3Title: "3. Telemetria e Análise:",
    privacy3Desc: "Coletamos informações analíticas anônimas, como o número de usuários por sala e os idiomas selecionados, para fornecer métricas de qualidade ao organizador do evento. Dados de identificação pessoal não são coletados sem consentimento.",
    privacy4Title: "4. Quadro Regulatório:",
    privacy4Desc: "Este processamento é realizado garantindo a conformidade com as normas atuais de proteção de dados aplicáveis a ambientes institucionais e corporativos.",
    terms1Title: "1. Uso do Serviço:",
    terms1Desc: "Esta plataforma é fornecida \"como está\" como uma ferramenta de assistência em tempo real para eventos ao vivo. O usuário concorda em não usar o sistema para fins ilegais ou que interfiram na transmissão tecnológica do evento.",
    terms2Title: "2. Propriedade Intelectual:",
    terms2Desc: "O design da interface e a marca branca mostrada pertencem ao organizador do evento ou à entidade licenciante. Sua reprodução ou distribuição sem autorização expressa é proibida.",
    terms3Title: "3. Natureza da Tradução:",
    terms3Desc: "A plataforma fornece traduções em tempo real geradas automaticamente para facilitar o entendimento geral. Devido à natureza do processamento automatizado e da linguagem falada, podem ocorrer variações, omissões ou imprecisões em relação à mensagem original. Este serviço foi concebido como suporte comunicativo e não constitui nem substitui uma tradução humana certificada.",
    terms4Title: "4. Disponibilidade:",
    terms4Desc: "Sendo um sistema que depende de conexões de rede e provedores de nuvem, o serviço pode apresentar latência ou interrupções inerentes à infraestrutura de internet local do usuário.",
    cookies1Title: "1. Cookies Técnicos Estritamente Necessários:",
    cookies1Desc: "Usamos tecnologias de armazenamento local em seu navegador (SessionStorage, LocalStorage e caches de Service Worker para Progressive Web Apps) exclusivamente para garantir o funcionamento técnico do aplicativo.",
    cookies2Title: "2. Ausência de Rastreadores de Publicidade:",
    cookies2Desc: "Não implementamos cookies de terceiros para publicidade, marketing cruzado ou venda de perfis de navegação. Nossa plataforma foi projetada desde o início sob o princípio de Privacy by Design.",
    cookies3Title: "3. Gerenciamento de Usuários:",
    cookies3Desc: "Ao clicar em \"Sair do evento\" ou usar o botão de desconexão, o sistema limpa ativamente o rastreamento da sua sessão das salas de memória."
  },
  fr: {
    exit: "Quitter",
    close: "Fermer",
    subtitlesOnly: "Sous-titres Uniquement",
    silentReading: "Lecture silencieuse à l'écran",
    audioOnly: "Audio Uniquement",
    headphonesReq: "Écouteurs requis",
    targetLang: "Langue cible",
    waitingSpeaker: "En attente de l'orateur...",
    neuralAudioActive: "Audio neuronal actif",
    transcriptionPaused: "La transcription est en pause pour maximiser les performances.",
    requestFloorBtn1: "Demander",
    requestFloorBtn2: "la Parole",
    writtenQuestionBtn1: "Question",
    writtenQuestionBtn2: "Écrite",
    status: "Statut",
    waitingQueue: "En file d'attente...",
    broadcasting: "En direct",
    micActive: "Votre micro est actif !",
    endIntervention: "Terminer mon intervention",
    switchToAudio: "Passer en mode audio",
    switchToText: "Passer en mode texte",
    projectedQuestion: "Question Projetée",
    askQuestion: "Poser une question",
    liveVoiceText: "Identifiez-vous pour que le modérateur puisse vous donner la parole.",
    mailboxText: "Envoyez votre question à l'orateur. Si elle est sélectionnée, elle sera projetée.",
    yourName: "Votre Nom",
    location: "Emplacement",
    writeQuestionHere: "Écrivez votre question ici...",
    listening: "Écoute en cours... Cliquez sur le bouton rouge pour arrêter.",
    sendToMailbox: "Envoyer",
    notSupported: "Non Supporté",
    notSupportedText: "Votre navigateur ne supporte pas la dictée. Veuillez utiliser le clavier.",
    sent: "Envoyé !",
    sentText: "Votre question a été envoyée à l'orateur.",
    permissionDenied: "Permission Refusée",
    permissionDeniedText: "Pour parler, vous devez autoriser l'accès au microphone.",
    privacy: "Confidentialité",
    terms: "Conditions",
    cookies: "Cookies",
    translationPlatform: "Plateforme de Traduction",
    room: "SALLE:",
    liveTranslation: "Traduction en Direct",
    enterCode: "Entrez le code ou scannez le QR de votre salle.",
    roomCode: "Code de la Salle",
    scanQR: "Scanner QR",
    enterRoom: "Entrer",
    validating: "Validation...",
    syncing: "Synchronisation...",
    reconnect: "Reconnecter",
    backToMenu: "Retour au menu",
    roomPaused: "Salle en Pause",
    roomPausedText: "Le système ou cette salle est actuellement inactif.",
    scanToJoin: "Scanner",
    pointCamera: "Pointez votre caméra vers le QR code.",
    cancel: "Annuler",
    confirm: "Confirmer",
    understood: "Compris",
    exitPrompt: "Voulez-vous vous déconnecter ?",
    privacy1Title: "1. Capture et Traitement de la Voix :",
    privacy1Desc: "La plateforme utilise le microphone de l'appareil émetteur exclusivement pour capturer la voix pendant la session active. L'audio est transmis en temps réel via des canaux cryptés à des serveurs de traitement automatisé tiers pour générer la traduction et la synthèse vocale neuronale.",
    privacy2Title: "2. Stockage Non Persistant :",
    privacy2Desc: "Les transmissions audio sont éphémères. Nous ne stockons, n'enregistrons ni ne conservons de copies vocales des orateurs ou du public dans des bases de données à long terme.",
    privacy3Title: "3. Télémétrie et Analytique :",
    privacy3Desc: "Nous recueillons des informations analytiques anonymes, telles que le nombre d'utilisateurs par salle et les langues sélectionnées. Les données personnelles ne sont pas collectées sans consentement.",
    privacy4Title: "4. Cadre Réglementaire :",
    privacy4Desc: "Ce traitement est effectué en garantissant le respect des normes actuelles de protection des données.",
    terms1Title: "1. Utilisation du Service :",
    terms1Desc: "Cette plateforme est fournie \"telle quelle\" comme un outil d'assistance en temps réel pour les événements en direct. L'utilisateur s'engage à ne pas utiliser le système à des fins illégales.",
    terms2Title: "2. Propriété Intellectuelle :",
    terms2Desc: "La conception de l'interface appartient à l'organisateur de l'événement. Sa reproduction est interdite.",
    terms3Title: "3. Nature de la Traduction :",
    terms3Desc: "La plateforme fournit des traductions générées automatiquement. En raison de la nature du traitement automatisé, des inexactitudes peuvent survenir. Ce service ne remplace pas une traduction humaine certifiée.",
    terms4Title: "4. Disponibilité :",
    terms4Desc: "Le service peut présenter une latence ou des interruptions inhérentes à l'infrastructure internet locale de l'utilisateur.",
    cookies1Title: "1. Cookies Techniques Strictement Nécessaires :",
    cookies1Desc: "Nous utilisons des technologies de stockage local dans votre navigateur exclusivement pour garantir le fonctionnement technique de l'application.",
    cookies2Title: "2. Absence de Traceurs Publicitaires :",
    cookies2Desc: "Nous ne mettons pas en œuvre de cookies tiers à des fins publicitaires. Notre plateforme est conçue selon le principe de Privacy by Design.",
    cookies3Title: "3. Gestion des Utilisateurs :",
    cookies3Desc: "En cliquant sur \"Quitter l'événement\", le système efface activement la trace de votre session de la mémoire."
  },
  de: {
    exit: "Verlassen",
    close: "Schließen",
    subtitlesOnly: "Nur Untertitel",
    silentReading: "Leises Lesen auf dem Bildschirm",
    audioOnly: "Nur Audio",
    headphonesReq: "Kopfhörer erforderlich",
    targetLang: "Zielsprache",
    waitingSpeaker: "Warten auf den Sprecher...",
    neuralAudioActive: "Neuronales Audio aktiv",
    transcriptionPaused: "Die Transkription ist pausiert, um die Leistung zu maximieren.",
    requestFloorBtn1: "Wort",
    requestFloorBtn2: "Erteilen",
    writtenQuestionBtn1: "Schriftliche",
    writtenQuestionBtn2: "Frage",
    status: "Status",
    waitingQueue: "In der Warteschlange...",
    broadcasting: "Übertragung",
    micActive: "Dein Mikrofon ist aktiv!",
    endIntervention: "Meine Wortmeldung beenden",
    switchToAudio: "Zum Audiomodus wechseln",
    switchToText: "Zum Textmodus wechseln",
    projectedQuestion: "Projizierte Frage",
    askQuestion: "Eine Frage stellen",
    liveVoiceText: "Identifizieren Sie sich, damit der Moderator Ihnen das Wort erteilen kann.",
    mailboxText: "Senden Sie Ihre Frage an den Sprecher. Wenn ausgewählt, wird sie projiziert.",
    yourName: "Dein Name",
    location: "Standort",
    writeQuestionHere: "Schreibe deine Frage hier...",
    listening: "Hört zu... Klicke auf den roten Button zum Stoppen.",
    sendToMailbox: "Senden",
    notSupported: "Nicht Unterstützt",
    notSupportedText: "Dein Browser unterstützt keine Spracheingabe. Bitte nutze die Tastatur.",
    sent: "Gesendet!",
    sentText: "Deine Frage wurde an den Sprecher gesendet.",
    permissionDenied: "Zugriff Verweigert",
    permissionDeniedText: "Um zu sprechen, musst du den Mikrofonzugriff erlauben.",
    privacy: "Datenschutz",
    terms: "Bedingungen",
    cookies: "Cookies",
    translationPlatform: "Übersetzungsplattform",
    room: "RAUM:",
    liveTranslation: "Live-Übersetzung",
    enterCode: "Code eingeben oder QR scannen.",
    roomCode: "Raumcode",
    scanQR: "QR Scannen",
    enterRoom: "Raum betreten",
    validating: "Validierung...",
    syncing: "Synchronisieren...",
    reconnect: "Neu verbinden",
    backToMenu: "Zurück zum Menü",
    roomPaused: "Raum pausiert",
    roomPausedText: "Das System oder dieser Raum ist derzeit inaktiv.",
    scanToJoin: "Scannen",
    pointCamera: "Richte die Kamera auf den QR-Code.",
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    understood: "Verstanden",
    exitPrompt: "Möchten Sie die Verbindung trennen?",
    privacy1Title: "1. Spracherfassung und -verarbeitung:",
    privacy1Desc: "Die Plattform verwendet das Mikrofon des sendenden Geräts ausschließlich zur Erfassung der Stimme während der aktiven Sitzung. Das Audio wird in Echtzeit über verschlüsselte Kanäle an automatisierte Verarbeitungsserver von Drittanbietern übertragen.",
    privacy2Title: "2. Nicht-persistente Speicherung:",
    privacy2Desc: "Audioübertragungen sind flüchtig. Wir speichern oder zeichnen keine Sprachkopien der Sprecher oder des Publikums in langfristigen Datenbanken auf.",
    privacy3Title: "3. Telemetrie und Analytik:",
    privacy3Desc: "Wir sammeln anonyme analytische Informationen, wie die Anzahl der Benutzer pro Raum und ausgewählte Sprachen. Personenbezogene Daten werden nicht ohne Zustimmung erfasst.",
    privacy4Title: "4. Regulatorischer Rahmen:",
    privacy4Desc: "Diese Verarbeitung erfolgt unter Gewährleistung der Einhaltung der geltenden Datenschutzstandards.",
    terms1Title: "1. Nutzung des Dienstes:",
    terms1Desc: "Diese Plattform wird \"wie besehen\" als Echtzeit-Assistenztool für Live-Events bereitgestellt. Der Nutzer stimmt zu, das System nicht für illegale Zwecke zu nutzen.",
    terms2Title: "2. Geistiges Eigentum:",
    terms2Desc: "Das Design der Benutzeroberfläche gehört dem Veranstalter. Eine Vervielfältigung ist untersagt.",
    terms3Title: "3. Art der Übersetzung:",
    terms3Desc: "Die Plattform bietet automatisch generierte Echtzeitübersetzungen. Aufgrund der Art der automatisierten Verarbeitung können Ungenauigkeiten auftreten. Dieser Dienst ersetzt keine zertifizierte menschliche Übersetzung.",
    terms4Title: "4. Verfügbarkeit:",
    terms4Desc: "Als System, das von Netzwerkverbindungen abhängt, kann der Dienst Latenzen oder Unterbrechungen aufweisen.",
    cookies1Title: "1. Zwingend erforderliche technische Cookies:",
    cookies1Desc: "Wir verwenden lokale Speichertechnologien in Ihrem Browser ausschließlich, um den technischen Betrieb der Anwendung zu gewährleisten.",
    cookies2Title: "2. Fehlen von Werbe-Trackern:",
    cookies2Desc: "Wir implementieren keine Cookies von Drittanbietern für Werbezwecke. Unsere Plattform ist nach dem Prinzip Privacy by Design konzipiert.",
    cookies3Title: "3. Benutzerverwaltung:",
    cookies3Desc: "Durch Klicken auf \"Event verlassen\" löscht das System aktiv Ihre Sitzungsspur aus dem Speicher."
  }
};

const AudienceView = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const isTvMode = queryParams.get('tv') === 'true';
  const urlLang = queryParams.get('lang');
  
  const urlCodeParam = queryParams.get('code');
  const savedCode = sessionStorage.getItem('audienceCode');
  const initialCode = urlCodeParam || savedCode || '';

  const [audienceCode, setAudienceCode] = useState(initialCode);
  const [eventInput, setEventInput] = useState('');
  const [eventError, setEventError] = useState('');
  const [eventName, setEventName] = useState('Traducción en Vivo');

  const [eventLogo, setEventLogo] = useState('');
  const [eventLogos, setEventLogos] = useState([]); 
  const [animateLogos, setAnimateLogos] = useState(false);
  const [eventSponsor, setEventSponsor] = useState('');

  const [roomName, setRoomName] = useState('');
  const [eventId, setEventId] = useState('');
  const [language, setLanguage] = useState(urlLang || 'es'); 
  
  const [finalTexts, setFinalTexts] = useState([]); 
  const [partialText, setPartialText] = useState(''); 
  
  const [isConnected, setIsConnected] = useState(false);
  const [userMode, setUserMode] = useState(null);

  const [isSystemActive, setIsSystemActive] = useState(true);
  const [isEventActive, setIsEventActive] = useState(true); 
  const [isRoomActive, setIsRoomActive] = useState(true); 
  
  const [isVerifying, setIsVerifying] = useState(!!initialCode);
  const [hasJoinedEvent, setHasJoinedEvent] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [legalModalContent, setLegalModalContent] = useState(null); 

  const [gracefulPauseMsg, setGracefulPauseMsg] = useState(null);

  // Estados para Preguntas del Público (Q&A)
  const [isQaActive, setIsQaActive] = useState(false); 
  const [qaState, setQaState] = useState('idle'); // idle, pending, approved
  const [isQaModalOpen, setIsQaModalOpen] = useState(false);
  const [qaModalType, setQaModalType] = useState('live'); // 'live' | 'mailbox'
  const [qaName, setQaName] = useState('');
  const [qaLocation, setQaLocation] = useState('');
  
  // Estados para el Buzón de Preguntas Escritas/Dictadas
  const [textQuestionContent, setTextQuestionContent] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [projectedTextQuestion, setProjectedTextQuestion] = useState(null);
  
  const speechRecognitionRef = useRef(null);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, confirmStyle: '' });

  // FUNCIÓN DE TRADUCCIÓN DE INTERFAZ
  const t = (key) => {
    return uiTranslations[language]?.[key] || uiTranslations['es'][key] || key;
  };

  const openDialog = (title, message, type = 'confirm', onConfirm = null, confirmStyle = 'bg-red-600 hover:bg-red-700 shadow-red-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  const audioPlayerRef = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const messagesEndRef = useRef(null);

  const wakeLockRef = useRef(null);

  const qaAudioContextRef = useRef(null);
  const qaProcessorRef = useRef(null);
  const qaStreamRef = useRef(null);

  const computedLogos = eventLogos.length > 0 ? eventLogos : (eventLogo ? [{ url: eventLogo, showOnMobile: true }] : []);
  let mobileLogos = computedLogos.filter(l => l.showOnMobile).slice(0, 3);
  if (mobileLogos.length === 0 && computedLogos.length > 0) {
      mobileLogos = [computedLogos[0]];
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [finalTexts, partialText]);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {});
      }
    } catch (err) {}
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {}
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible' && userMode) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userMode]);

  const playNextInQueue = async () => {
    if (isPlaying.current || audioQueue.current.length === 0 || !isSystemActive || !isEventActive || !isRoomActive) return;
    isPlaying.current = true;
    const nextAudioUrl = audioQueue.current.shift(); 
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = nextAudioUrl;
      try {
        await audioPlayerRef.current.play();
      } catch (error) {
        isPlaying.current = false;
        playNextInQueue(); 
      }
    }
  };

  const handleAudioEnded = () => {
    if (audioPlayerRef.current && audioPlayerRef.current.src) {
      URL.revokeObjectURL(audioPlayerRef.current.src);
    }
    isPlaying.current = false;
    playNextInQueue();
  };

  const verifyAudienceCode = (code) => {
    socket.emit('check-audience-code', code, (response) => {
      if (response.success) {
        setAudienceCode(code);
        setEventId(response.eventId);
        setRoomName(response.roomName);
        setEventName(response.eventName);
        setEventLogo(response.logoUrl || '');
        setEventLogos(response.logos || []);
        setAnimateLogos(response.animateLogos || false);
        setEventSponsor(response.sponsorText || '');
        setEventError('');
        setIsRoomActive(true); 
        sessionStorage.setItem('audienceCode', code);
        
        socket.emit('join-direct-room-audience', { 
            eventId: response.eventId, 
            roomName: response.roomName, 
            language: language,
            deviceId: getDeviceId(),
            isTv: isTvMode 
        });
        setHasJoinedEvent(true); 
        setGracefulPauseMsg(null); 
      } else {
        setEventError(response.message || 'Código de sala inválido o evento finalizado.');
        if (code === audienceCode) {
            setAudienceCode(''); 
        }
        sessionStorage.removeItem('audienceCode');
        setHasJoinedEvent(false);
      }
      setIsVerifying(false); 
    });
  };

  const handleEventSubmit = (e) => {
    e.preventDefault();
    if (!eventInput.trim()) return;
    setIsVerifying(true);
    verifyAudienceCode(eventInput.trim());
  };

  const handleQRScan = (data) => {
    let scannedText = '';
    if (typeof data === 'string') scannedText = data;
    else if (Array.isArray(data) && data.length > 0) scannedText = data[0].rawValue || data[0].text || '';
    else if (data && data.text) scannedText = data.text;

    if (scannedText) {
        setIsScanning(false); 
        let extractedCode = scannedText;
        try {
            const url = new URL(scannedText);
            const codeParam = url.searchParams.get('code');
            if (codeParam) extractedCode = codeParam;
        } catch (e) {}
        
        const finalCode = extractedCode.toUpperCase().trim();
        setEventInput(finalCode);
        setIsVerifying(true);
        verifyAudienceCode(finalCode);
    }
  };

  const handleExitEvent = () => {
    openDialog(
      t('exit'),
      t('exitPrompt'),
      "confirm",
      () => {
        socket.emit('leave-event-audience'); 
        sessionStorage.removeItem('audienceCode');
        setAudienceCode('');
        setEventId('');
        setRoomName('');
        setEventInput('');
        setUserMode(null);
        setFinalTexts([]);
        setPartialText('');
        setEventLogo('');
        setEventLogos([]);
        setAnimateLogos(false);
        setHasJoinedEvent(false); 
        setGracefulPauseMsg(null);
        setQaState('idle');
        setIsQaActive(false);
        audioQueue.current = [];
        isPlaying.current = false;
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.removeAttribute('src');
        }
        stopQaRecording(); 
        releaseWakeLock();
      }
    );
  };

  const stopPlaybackAndClear = () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.removeAttribute('src');
      }
      audioQueue.current = [];
      isPlaying.current = false;
      setFinalTexts([]);
      setPartialText('');
      releaseWakeLock();
  };

  const handleQaVoiceSubmit = (e) => {
    e.preventDefault();
    if (!qaName.trim()) return;
    
    socket.emit('qa-request-floor', {
        eventId,
        roomName,
        name: qaName.trim(),
        location: qaLocation.trim(),
        language 
    });
    
    setIsQaModalOpen(false);
    setQaState('pending');
  };

  const handleQaTextSubmit = (e) => {
    e.preventDefault();
    if (!qaName.trim() || !textQuestionContent.trim()) return;
    
    socket.emit('qa-submit-text', {
        eventId,
        roomName,
        name: qaName.trim(),
        location: qaLocation.trim(),
        language,
        text: textQuestionContent.trim()
    });
    
    setIsQaModalOpen(false);
    setTextQuestionContent('');
    openDialog(t('sent'), t('sentText'), "alert", null, "bg-green-600 hover:bg-green-700 shadow-green-500/25");
  };

  const cancelQaRequest = () => {
    socket.emit('qa-reject-floor', { eventId, roomName, targetSocketId: socket.id });
    setQaState('idle');
  };

  const toggleDictation = () => {
    if (isDictating) {
        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop();
        }
        setIsDictating(false);
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        openDialog(t('notSupported'), t('notSupportedText'), "alert");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : language === 'pt' ? 'pt-BR' : language === 'fr' ? 'fr-FR' : language === 'de' ? 'de-DE' : 'es-CO';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        setIsDictating(true);
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        if (finalTranscript) {
            setTextQuestionContent(prev => prev + (prev.endsWith(' ') ? '' : ' ') + finalTranscript);
        }
    };

    recognition.onerror = (event) => {
        console.error("Error en dictado:", event.error);
        setIsDictating(false);
    };

    recognition.onend = () => {
        setIsDictating(false);
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
  };

  const stopQaRecording = () => {
    if (qaProcessorRef.current) qaProcessorRef.current.disconnect();
    if (qaAudioContextRef.current && qaAudioContextRef.current.state !== 'closed') {
      qaAudioContextRef.current.close().catch(() => {});
    }
    if (qaStreamRef.current) qaStreamRef.current.getTracks().forEach(track => track.stop());
  };

  const startQaRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      qaStreamRef.current = stream;
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      qaAudioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input.length > 0) {
              const channelData = input[0];
              const pcm16 = new Int16Array(channelData.length);
              for (let i = 0; i < channelData.length; i++) {
                let s = Math.max(-1, Math.min(1, channelData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(pcm16.buffer);
            }
            return true; 
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);

      await audioContext.audioWorklet.addModule(workletUrl);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      qaProcessorRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (socket.connected && isSystemActive) {
          socket.emit('qa-audio-stream', { eventId, roomName, audioData: event.data });
        }
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(workletNode);
      workletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

    } catch (error) {
      console.error('Error al acceder al micrófono del público:', error);
      openDialog(t('permissionDenied'), t('permissionDeniedText'), "alert");
      cancelQaRequest(); 
    }
  };

  useEffect(() => {
    if (qaState === 'approved') {
        startQaRecording();
    } else {
        stopQaRecording();
    }
    return () => stopQaRecording();
  }, [qaState]);

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
      if (isSystemActive && audienceCode && !gracefulPauseMsg) {
          verifyAudienceCode(audienceCode);
      }
    });
    
    socket.on('disconnect', () => {
        setIsConnected(false);
        stopQaRecording();
    });

    socket.on('system-status', (status) => {
      setIsSystemActive(status);
      if (!status) stopPlaybackAndClear();
    });

    socket.on('event-status-changed', (data) => {
        if (data.eventId === eventId) {
            setIsEventActive(data.status);
            if (!data.status) stopPlaybackAndClear();
        }
    });

    socket.on('room-status-changed', (data) => {
        if (data.eventId === eventId && data.roomName === roomName) {
            setIsRoomActive(data.status);
            if (!data.status) stopPlaybackAndClear();
        }
    });

    socket.on('event-info', (data) => {
        setEventName(data.name);
        setIsEventActive(data.isActive); 
        setEventLogo(data.logoUrl || '');
        setEventLogos(data.logos || []);
        setAnimateLogos(data.animateLogos || false);
        setEventSponsor(data.sponsorText || '');
    });

    socket.on('graceful-pause', () => {
        stopPlaybackAndClear();
        setGracefulPauseMsg(t('syncing'));
    });
    
    socket.on('translation-result', (data) => {
      if (!isSystemActive || !isEventActive || !isRoomActive || gracefulPauseMsg) return; 
      if (qaState === 'approved' && data.isQa) return;

      if (isTvMode || userMode === 'text') {
        let currentText = '';
        if (data.translations && data.translations[language]) {
          currentText = data.translations[language];
        } else if (data.original) {
          currentText = data.original;
        }

        if (data.isQa && currentText) {
            currentText = `🗣️ ${currentText}`;
        }

        if (data.type === 'partial') {
          setPartialText(currentText);
        } else if (data.type === 'final') {
          if (currentText.trim() !== '') {
            setFinalTexts(prev => {
              const newTexts = [...prev, currentText];
              const limit = isTvMode ? 5 : 4; 
              return newTexts.slice(-limit);
            });
          }
          setPartialText('');
        }
      }
    });

    socket.on('neural-audio', (data) => {
      if (!isSystemActive || !isEventActive || !isRoomActive || gracefulPauseMsg) return; 
      if (qaState === 'approved' && data.isQa) return;

      if (!isTvMode && userMode === 'audio' && data.language === language && data.audioBuffer) {
        const blob = new Blob([data.audioBuffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        audioQueue.current.push(url);
        playNextInQueue();
      }
    });

    socket.on('qa-status-changed', (status) => {
        setIsQaActive(status);
        if (!status) {
            setQaState('idle');
            setIsQaModalOpen(false);
            stopQaRecording();
        }
    });

    socket.on('qa-floor-granted', () => {
        setQaState('approved');
        setIsQaModalOpen(false); 
    });

    socket.on('qa-floor-revoked', () => {
        setQaState('idle');
        setIsQaModalOpen(false);
    });

    socket.on('qa-projected-text-question', (question) => {
        setProjectedTextQuestion(question);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('event-info');
      socket.off('event-status-changed');
      socket.off('room-status-changed');
      socket.off('translation-result');
      socket.off('neural-audio');
      socket.off('system-status');
      socket.off('graceful-pause');
      socket.off('qa-status-changed');
      socket.off('qa-floor-granted');
      socket.off('qa-floor-revoked');
      socket.off('qa-projected-text-question');
      releaseWakeLock();
    };
  }, [language, userMode, isTvMode, audienceCode, eventId, roomName, isSystemActive, isEventActive, isRoomActive, gracefulPauseMsg, qaState]); 

  const unlockAudioAndStart = async () => {
    setUserMode('audio'); 
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
        await audioPlayerRef.current.play();
      }
    } catch (e) {
      console.warn("[Audio] Advertencia de desbloqueo:", e);
    }
    requestWakeLock();
  };

  const startTextMode = () => {
    setUserMode('text');
    requestWakeLock();
  };

  const switchMode = async () => {
    if (userMode === 'text') {
      await unlockAudioAndStart();
    } else {
      setUserMode('text');
      audioQueue.current = [];
      isPlaying.current = false;
      try {
          if (audioPlayerRef.current) {
              audioPlayerRef.current.pause();
              audioPlayerRef.current.removeAttribute('src'); 
          }
      } catch(e) {}
      requestWakeLock();
    }
  };

  const LegalFooter = () => (
    <div className="mt-6 flex flex-wrap justify-center items-center gap-x-3 gap-y-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center w-full">
        <button onClick={() => setLegalModalContent('privacy')} className="hover:text-gray-300 transition-colors underline decoration-gray-700 underline-offset-4">{t('privacy')}</button>
        <span className="text-gray-700">•</span>
        <button onClick={() => setLegalModalContent('terms')} className="hover:text-gray-300 transition-colors underline decoration-gray-700 underline-offset-4">{t('terms')}</button>
        <span className="text-gray-700">•</span>
        <button onClick={() => setLegalModalContent('cookies')} className="hover:text-gray-300 transition-colors underline decoration-gray-700 underline-offset-4">{t('cookies')}</button>
        <div className="w-full mt-2 text-gray-600 flex items-center justify-center gap-1.5">
           <Scale className="w-3 h-3" /> © {new Date().getFullYear()} {t('translationPlatform')}
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full relative">
      
      <style>
        {`
          @keyframes shine {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes logo-glow {
            0%, 100% { filter: drop-shadow(0 0 8px rgba(168,85,247,0.5)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 20px rgba(59,130,246,0.9)); transform: scale(1.03); }
          }
          @keyframes scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-metallic {
            background: linear-gradient(90deg, #d97743, #60a5fa, #e7e5e4, #d97743);
            background-size: 300% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: shine 4s linear infinite;
          }
          .animate-logo-pulse {
            animation: logo-glow 3s ease-in-out infinite;
          }
          .animate-scroll-left {
            animation: scroll-left 90s linear infinite;
          }
          .mask-edges {
            -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
            mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
          }
        `}
      </style>

      {/* Modal para Identificación y Q&A */}
      {isQaModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
          <div className="bg-darker border border-gray-700 p-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full flex flex-col transform transition-all scale-100">
            <div className="flex justify-between items-center mb-5">
               <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                 {qaModalType === 'live' ? <Mic className="w-5 h-5 text-primary" /> : <MessageSquare className="w-5 h-5 text-primary" />} 
                 {t('askQuestion')}
               </h3>
               <button onClick={() => setIsQaModalOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1 bg-gray-800 rounded-full">
                 <X className="w-4 h-4" />
               </button>
            </div>

            {qaModalType === 'live' ? (
                <form onSubmit={handleQaVoiceSubmit} className="flex flex-col gap-4">
                   <p className="text-gray-400 text-sm leading-relaxed mb-2">{t('liveVoiceText')}</p>
                   <div className="flex flex-col gap-3">
                       <input type="text" value={qaName} onChange={e => setQaName(e.target.value)} placeholder={t('yourName')} className="w-full bg-dark border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder-gray-600" required />
                       <input type="text" value={qaLocation} onChange={e => setQaLocation(e.target.value)} placeholder={t('location')} className="w-full bg-dark border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder-gray-600" />
                   </div>
                   <div className="mt-2 flex justify-end">
                     <button type="submit" disabled={!qaName.trim()} className="w-full px-5 py-3.5 rounded-xl bg-primary hover:bg-blue-600 text-white transition-all text-sm font-bold shadow-lg disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                         <Hand className="w-4 h-4" /> {t('requestFloorBtn1')} {t('requestFloorBtn2')}
                     </button>
                   </div>
                </form>
            ) : (
                <form onSubmit={handleQaTextSubmit} className="flex flex-col gap-4">
                   <p className="text-gray-400 text-sm leading-relaxed mb-2">{t('mailboxText')}</p>
                   <div className="flex flex-col gap-3">
                       <input type="text" value={qaName} onChange={e => setQaName(e.target.value)} placeholder={t('yourName')} className="w-full bg-dark border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder-gray-600" required />
                       <input type="text" value={qaLocation} onChange={e => setQaLocation(e.target.value)} placeholder={t('location')} className="w-full bg-dark border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder-gray-600" />
                   </div>
                   
                   <div className="relative">
                       <textarea 
                           value={textQuestionContent}
                           onChange={e => setTextQuestionContent(e.target.value)}
                           placeholder={t('writeQuestionHere')}
                           className="w-full bg-dark border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder-gray-600 min-h-[100px] resize-none pr-12"
                           required
                       />
                       <button 
                           type="button" 
                           onClick={toggleDictation}
                           title="Dictar por voz"
                           className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all shadow-md flex items-center justify-center ${isDictating ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-800 text-primary hover:bg-primary hover:text-white'}`}
                       >
                           {isDictating ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                       </button>
                   </div>
                   {isDictating && (
                       <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-2 rounded-lg text-xs font-bold text-center flex items-center justify-center gap-2 shadow-inner">
                           <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div> {t('listening')}
                       </div>
                   )}

                   <div className="mt-2 flex justify-end">
                     <button type="submit" disabled={!qaName.trim() || !textQuestionContent.trim()} className="w-full px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all text-sm font-bold shadow-lg disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                         <MessageSquare className="w-4 h-4" /> {t('sendToMailbox')}
                     </button>
                   </div>
                </form>
            )}
          </div>
        </div>
      )}

      {dialogConfig.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
          <div className="bg-darker border border-gray-700 p-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full flex flex-col gap-2 transform transition-all scale-100">
            <div className="flex items-center gap-3 mb-2">
               <AlertCircle className={`w-7 h-7 ${dialogConfig.type === 'alert' ? 'text-yellow-500' : 'text-red-500'}`} />
               <h3 className="text-xl font-bold text-white tracking-wide">{dialogConfig.title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{dialogConfig.message}</p>
            <div className="flex justify-end gap-3 mt-2">
              {dialogConfig.type === 'confirm' && (
                <button onClick={closeDialog} className="px-5 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-sm font-bold tracking-wide">
                  {t('cancel')}
                </button>
              )}
              <button 
                onClick={() => { if(dialogConfig.onConfirm) dialogConfig.onConfirm(); closeDialog(); }} 
                className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold tracking-wide transition-all shadow-lg ${dialogConfig.confirmStyle}`}
              >
                {dialogConfig.type === 'alert' ? t('understood') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isVerifying ? (
        <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase">{t('validating')}</p>
          </div>
        </div>
      ) : gracefulPauseMsg ? (
         <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black relative overflow-hidden">
            <div className="absolute inset-0 bg-darker/80 z-0"></div>
            <div className="w-full max-w-sm flex flex-col items-center z-10">
              <div className="bg-primary/10 p-6 rounded-full mb-8 relative">
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <RefreshCw className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 text-center tracking-tight">{t('syncing')}</h2>
              <p className="text-gray-400 text-sm text-center leading-relaxed max-w-xs mb-8">
                {gracefulPauseMsg}
              </p>
              <button
                onClick={() => {
                    setIsVerifying(true);
                    verifyAudienceCode(audienceCode);
                }}
                className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg text-sm tracking-widest uppercase"
              >
                {t('reconnect')}
              </button>
              <button
                onClick={() => {
                    socket.emit('leave-event-audience'); 
                    sessionStorage.removeItem('audienceCode');
                    setAudienceCode('');
                    setGracefulPauseMsg(null);
                }}
                className="mt-6 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
              >
                {t('backToMenu')}
              </button>
            </div>
         </div>
      ) : isScanning ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
            <div className="flex justify-between items-center p-6 bg-darker border-b border-gray-800 shrink-0">
                <h3 className="text-white font-bold tracking-widest uppercase flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-primary" />
                    {t('scanToJoin')}
                </h3>
                <button 
                    onClick={() => setIsScanning(false)} 
                    className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 relative flex flex-col items-center justify-center bg-black p-6">
                <p className="text-gray-400 text-sm text-center mb-8 max-w-xs">
                    {t('pointCamera')}
                </p>
                <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.15)] border border-primary/30 relative bg-darker">
                    <Scanner
                        onScan={(result) => handleQRScan(result)}
                        onError={(error) => console.log("[Scanner] Error/Esperando cámara:", error)}
                        constraints={{ facingMode: 'environment' }}
                        components={{ audio: false, onOff: true }}
                    />
                </div>
            </div>
        </div>
      ) : legalModalContent ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-darker overflow-hidden">
           <div className="flex justify-between items-center p-5 bg-dark border-b border-gray-800 shrink-0 shadow-lg z-10">
              <h3 className="text-white font-bold tracking-widest uppercase flex items-center gap-2 text-sm">
                  <Scale className="w-4 h-4 text-primary" />
                  {legalModalContent === 'privacy' && t('privacy')}
                  {legalModalContent === 'terms' && t('terms')}
                  {legalModalContent === 'cookies' && t('cookies')}
              </h3>
              <button onClick={() => setLegalModalContent(null)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-red-500 hover:border-red-500 p-1.5 rounded-lg border border-gray-700 transition-all">
                  <X className="w-5 h-5" />
              </button>
           </div>
           <div className="flex-1 overflow-y-auto p-6 md:p-8 text-gray-300 text-sm leading-relaxed">
              <div className="max-w-2xl mx-auto space-y-6">
                  {legalModalContent === 'privacy' && (
                      <>
                          <p><strong>{t('privacy1Title')}</strong> {t('privacy1Desc')}</p>
                          <p><strong>{t('privacy2Title')}</strong> {t('privacy2Desc')}</p>
                          <p><strong>{t('privacy3Title')}</strong> {t('privacy3Desc')}</p>
                          <p><strong>{t('privacy4Title')}</strong> {t('privacy4Desc')}</p>
                      </>
                  )}
                  {legalModalContent === 'terms' && (
                      <>
                          <p><strong>{t('terms1Title')}</strong> {t('terms1Desc')}</p>
                          <p><strong>{t('terms2Title')}</strong> {t('terms2Desc')}</p>
                          <p><strong>{t('terms3Title')}</strong> {t('terms3Desc')}</p>
                          <p><strong>{t('terms4Title')}</strong> {t('terms4Desc')}</p>
                      </>
                  )}
                  {legalModalContent === 'cookies' && (
                      <>
                          <p><strong>{t('cookies1Title')}</strong> {t('cookies1Desc')}</p>
                          <p><strong>{t('cookies2Title')}</strong> {t('cookies2Desc')}</p>
                          <p><strong>{t('cookies3Title')}</strong> {t('cookies3Desc')}</p>
                      </>
                  )}
              </div>
           </div>
        </div>
      ) : !isSystemActive || (audienceCode && (!isEventActive || !isRoomActive)) ? (
        <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black relative overflow-hidden">
          <div className="absolute inset-0 bg-darker/80 z-0"></div>
          <div className="w-full max-w-sm flex flex-col items-center z-10">
            <div className="bg-red-500/10 p-6 rounded-full mb-8">
              <PowerOff className="w-16 h-16 text-red-500/80" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3 text-center tracking-tight">{t('roomPaused')}</h2>
            <p className="text-gray-400 text-base text-center leading-relaxed max-w-xs mb-8">
              {t('roomPausedText')}
            </p>
            <button 
              onClick={handleExitEvent}
              className="text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest border border-gray-800 rounded-lg px-4 py-2"
            >
              <LogOut className="w-4 h-4" />
              {t('backToMenu')}
            </button>
          </div>
        </div>
      ) : !audienceCode ? (
        <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker relative">
          
          <div className="absolute top-6 right-6 flex items-center gap-3 z-10">
            <div className="relative">
              <select 
                value={language} 
                onChange={(e) => {
                  setLanguage(e.target.value);
                  socket.emit('audience-change-lang', e.target.value);
                }}
                className="bg-gray-800 border border-gray-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm flex flex-col items-center mt-8">
            <div className="flex flex-wrap justify-center items-center gap-6 mb-6">
                {mobileLogos.map((logo, idx) => (
                    <img key={idx} src={logo.url} alt="Logo" className="h-14 md:h-16 w-auto max-w-[120px] object-contain drop-shadow-lg animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />
                ))}
                {mobileLogos.length === 0 && <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2 text-center tracking-tight">{eventName === 'Traducción en Vivo' ? t('liveTranslation') : eventName}</h2>
            <p className="text-gray-400 text-sm text-center mb-8 leading-relaxed px-4">
              {t('enterCode')}
            </p>
            
            <form onSubmit={handleEventSubmit} className="w-full flex flex-col gap-4">
              <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Key className="w-5 h-5 text-gray-500" />
                  </div>
                  <input 
                      type="text"
                      value={eventInput}
                      onChange={(e) => setEventInput(e.target.value.toUpperCase().trim())}
                      placeholder={t('roomCode')}
                      className="w-full bg-dark border border-gray-700 text-white text-center text-lg font-bold tracking-widest rounded-xl py-4 pl-10 pr-16 focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-inner"
                  />
                  <button
                      type="button"
                      onClick={() => setIsScanning(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shadow-lg"
                      title={t('scanQR')}
                  >
                      <QrCode className="w-5 h-5" />
                  </button>
              </div>
              {eventError && <p className="text-red-500 text-xs font-semibold text-center animate-pulse">{eventError}</p>}
              <button 
                type="submit"
                disabled={!eventInput.trim() || !isConnected}
                className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 tracking-widest uppercase mt-2"
              >
                {t('enterRoom')}
              </button>
            </form>

            {eventSponsor && (
               <div className="mt-8 text-xs font-semibold tracking-wider uppercase text-center w-full">
                   <span className="animate-metallic">{eventSponsor}</span>
               </div>
            )}
            <LegalFooter />
          </div>
        </div>
      ) : isTvMode ? (
        <div className="flex flex-col h-screen w-full bg-black p-8 md:p-16 lg:pb-16 overflow-hidden relative">
          
          {projectedTextQuestion && (
             <div className="absolute top-12 left-0 right-0 mx-auto bg-blue-900/40 border border-blue-500/50 backdrop-blur-xl p-8 rounded-3xl shadow-[0_0_50px_rgba(59,130,246,0.3)] z-[100] max-w-4xl w-[90%] flex flex-col gap-4 animate-[logo-glow_3s_ease-in-out_infinite]">
                 <div className="flex items-center gap-3 border-b border-blue-500/30 pb-4">
                     <div className="bg-blue-500/20 p-2 rounded-full">
                         <MessageSquare className="w-8 h-8 text-blue-400" />
                     </div>
                     <div className="flex flex-col">
                         <span className="text-sm font-bold text-blue-300 uppercase tracking-widest">{t('projectedQuestion')}</span>
                         <span className="text-xl font-bold text-white">{projectedTextQuestion.name} {projectedTextQuestion.location ? `(${projectedTextQuestion.location})` : ''}</span>
                     </div>
                 </div>
                 <p className="text-3xl md:text-4xl text-white font-medium leading-relaxed break-words whitespace-normal">
                     "{projectedTextQuestion.translations && projectedTextQuestion.translations[language] 
                        ? projectedTextQuestion.translations[language] 
                        : projectedTextQuestion.text}"
                 </p>
             </div>
          )}

          <div className="absolute top-6 right-8 z-10 flex items-center gap-4 bg-dark/80 p-3 rounded-2xl backdrop-blur-md border border-gray-800 shadow-xl transition-all duration-500 opacity-10 hover:opacity-100 hover:bg-dark">
            <div className="bg-black/50 border border-gray-700 text-gray-300 text-xs font-bold uppercase tracking-wider rounded-lg px-4 py-2">
                {t('room')} {roomName}
            </div>

            <div className="relative">
              <select 
                value={language} 
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setFinalTexts([]);
                  setPartialText('');
                  socket.emit('audience-change-lang', e.target.value);
                }}
                className="bg-black/50 border border-gray-700 text-gray-300 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
            <button 
              onClick={handleExitEvent}
              className="bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg px-4 py-2 transition-all flex items-center gap-2 shadow-sm"
            >
              <LogOut className="w-3 h-3" /> {t('close')}
            </button>
          </div>

          <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-end gap-6 overflow-hidden relative z-0 mb-32 md:mb-40">
            {finalTexts.map((text, idx) => (
              <p key={idx} className="text-4xl md:text-5xl lg:text-6xl font-medium text-white/50 text-left leading-normal tracking-wide drop-shadow-2xl transition-all duration-300">
                {text}
              </p>
            ))}
            <p className="text-4xl md:text-5xl lg:text-6xl font-medium text-white text-left leading-normal tracking-wide drop-shadow-2xl min-h-[5rem] transition-all duration-200">
              {partialText || (finalTexts.length === 0 ? "..." : "")}
            </p>
            <div ref={messagesEndRef} />
          </div>
          
          {(computedLogos.length > 0 || eventSponsor) && (
              <div className="absolute bottom-8 left-8 right-8 z-10 flex items-center justify-between gap-6 opacity-80 pointer-events-none">
                  {animateLogos && computedLogos.length > 0 ? (
                      <div className="flex-1 overflow-hidden mask-edges flex">
                          <div className="flex w-max animate-scroll-left gap-8 md:gap-12 pr-8 md:pr-12">
                              {[...computedLogos, ...computedLogos, ...computedLogos, ...computedLogos, ...computedLogos, ...computedLogos, ...computedLogos, ...computedLogos].map((logo, idx) => (
                                  <img key={idx} src={logo.url} alt={`Sponsor`} className="h-16 md:h-20 lg:h-24 w-auto max-w-[150px] object-contain drop-shadow-2xl" onError={(e) => { e.target.style.display = 'none'; }} />
                              ))}
                          </div>
                      </div>
                  ) : (
                      <div className="flex-1 flex flex-wrap items-center justify-evenly gap-4 md:gap-8 w-full">
                          {computedLogos.map((logo, idx) => (
                              <img key={idx} src={logo.url} alt={`Sponsor ${idx+1}`} className="h-16 md:h-20 lg:h-24 w-auto max-w-[150px] object-contain animate-logo-pulse drop-shadow-2xl" onError={(e) => { e.target.style.display = 'none'; }} />
                          ))}
                      </div>
                  )}
                  {eventSponsor && <span className="text-lg md:text-xl font-semibold tracking-wider text-right shrink-0 max-w-[250px]"><span className="animate-metallic">{eventSponsor}</span></span>}
              </div>
          )}
        </div>
      ) : !userMode ? (
        <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker relative">
          
          <div className="absolute top-6 right-6 flex items-center gap-3 z-10">
            <div className="relative">
              <select 
                value={language} 
                onChange={(e) => {
                  setLanguage(e.target.value);
                  socket.emit('audience-change-lang', e.target.value);
                }}
                className="bg-gray-800 border border-gray-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
            <button 
              onClick={handleExitEvent}
              className="text-gray-500 hover:text-red-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              {t('exit')}
            </button>
          </div>

          <div className="w-full max-w-sm flex flex-col items-center mt-6">
            
            <div className="flex flex-wrap justify-center items-center gap-6 mb-6">
                {mobileLogos.map((logo, idx) => (
                    <img key={idx} src={logo.url} alt="Event Logo" className="h-16 w-auto max-w-[120px] object-contain drop-shadow-lg animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />
                ))}
                {mobileLogos.length === 0 && <img src="/logo.png" alt="Event Logo" className="h-16 w-auto object-contain drop-shadow-lg animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            
            <h2 className="text-xl font-bold text-gray-400 mb-1 text-center tracking-tight">{eventName}</h2>
            <h1 className="text-2xl font-black text-white mb-8 text-center uppercase tracking-widest bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">{roomName}</h1>
            
            <div className="flex flex-col gap-4 w-full">
              <button 
                onClick={startTextMode} 
                className="group bg-dark border border-gray-700 hover:border-gray-500 p-5 rounded-2xl flex items-center gap-5 transition-all shadow-lg hover:bg-gray-800"
              >
                <div className="bg-gray-800 p-3 rounded-full group-hover:bg-gray-700 transition-colors">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-white font-bold text-lg">{t('subtitlesOnly')}</span>
                  <span className="text-gray-500 text-xs mt-1">{t('silentReading')}</span>
                </div>
              </button>

              <button 
                onClick={unlockAudioAndStart} 
                className="group bg-primary hover:bg-blue-600 border border-primary p-5 rounded-2xl flex items-center gap-5 transition-all shadow-lg shadow-blue-500/20"
              >
                <div className="bg-white/10 p-3 rounded-full">
                  <Headphones className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-white font-bold text-lg">{t('audioOnly')}</span>
                  <span className="text-blue-100/70 text-xs mt-1">{t('headphonesReq')}</span>
                </div>
              </button>
            </div>
            
            {eventSponsor && (
               <div className="mt-8 text-xs font-semibold tracking-wider uppercase text-center w-full">
                   <span className="animate-metallic">{eventSponsor}</span>
               </div>
            )}

            <LegalFooter />
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker relative">
          <audio ref={audioPlayerRef} onEnded={handleAudioEnded} className="hidden" />

          {projectedTextQuestion && (
             <div className="absolute top-16 left-4 right-4 bg-blue-900/40 border border-blue-500/50 backdrop-blur-xl p-5 rounded-3xl shadow-[0_0_30px_rgba(59,130,246,0.3)] z-50 flex flex-col gap-3">
                 <div className="flex items-center gap-3 border-b border-blue-500/30 pb-3">
                     <div className="bg-blue-500/20 p-2 rounded-full">
                         <MessageSquare className="w-5 h-5 text-blue-400" />
                     </div>
                     <div className="flex flex-col">
                         <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">{t('projectedQuestion')}</span>
                         <span className="text-sm font-bold text-white">{projectedTextQuestion.name} {projectedTextQuestion.location ? `(${projectedTextQuestion.location})` : ''}</span>
                     </div>
                 </div>
                 <p className="text-lg text-white font-medium italic break-words whitespace-normal">
                     "{projectedTextQuestion.translations && projectedTextQuestion.translations[language] 
                        ? projectedTextQuestion.translations[language] 
                        : projectedTextQuestion.text}"
                 </p>
             </div>
          )}

          <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <img src={(mobileLogos.length > 0 ? mobileLogos[0].url : '') || "/logo.png"} alt="Event Logo" className="h-8 w-auto max-w-[100px] object-contain animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="flex flex-col">
                <h1 className="text-base font-bold text-white leading-tight truncate max-w-[150px]">{eventName}</h1>
                <span className="text-xs text-primary font-bold tracking-widest">{roomName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest hidden sm:inline-block">
                {userMode === 'text' ? t('subtitlesOnly') : t('audioOnly')}
              </span>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-accent animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <button 
                onClick={handleExitEvent}
                className="ml-2 text-gray-600 hover:text-red-500 transition-colors"
                title={t('exit')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="mb-6 shrink-0">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              <Globe2 className="w-4 h-4" />
              {t('targetLang')}
            </label>
            <div className="relative">
              <select 
                value={language} 
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setFinalTexts([]);
                  setPartialText('');
                  audioQueue.current = []; 
                  socket.emit('audience-change-lang', e.target.value);
                }}
                className="w-full bg-dark border border-gray-700 text-white text-lg rounded-xl p-4 focus:ring-2 focus:ring-accent focus:outline-none appearance-none cursor-pointer"
              >
                <option value="es">Español</option>
                <option value="en">English (Inglés)</option>
                <option value="de">Deutsch (Alemán)</option>
                <option value="fr">Français (Francés)</option>
                <option value="pt">Português (Portugués)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          <main className="flex-1 flex flex-col justify-end pb-6 overflow-hidden relative">
            {userMode === 'text' ? (
              <div className="flex flex-col gap-4 justify-end h-full w-full overflow-hidden">
                {finalTexts.map((text, idx) => (
                  <p key={idx} className="text-2xl md:text-3xl font-normal leading-relaxed text-white/50 text-left tracking-wide transition-all duration-300">
                    {text}
                  </p>
                ))}
                <p className="text-2xl md:text-3xl font-medium leading-relaxed text-white min-h-[3rem] text-left tracking-wide transition-all duration-200">
                  {partialText || (finalTexts.length === 0 ? t('waitingSpeaker') : "")}
                </p>
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full mb-4 opacity-70">
                <div className="relative flex items-center justify-center w-32 h-32 mb-6">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                  <div className="absolute inset-4 bg-primary/40 rounded-full animate-pulse"></div>
                  <div className="relative bg-primary p-6 rounded-full shadow-lg shadow-blue-500/50">
                    <Radio className="w-10 h-10 text-white" />
                  </div>
                </div>
                <p className="text-gray-400 text-center text-lg font-medium tracking-wide">
                  {t('neuralAudioActive')}
                </p>
                <p className="text-gray-500 text-sm text-center mt-2 px-4">
                  {t('transcriptionPaused')}
                </p>
              </div>
            )}
          </main>

          <footer className="shrink-0 pb-4 pt-4 border-t border-gray-800/50 flex flex-col items-center w-full relative z-10 bg-darker">
            {isQaActive && (
                <div className="w-full mb-4">
                  {/* QA Idle */}
                  {qaState === 'idle' && (
                    <div className="flex gap-3 w-full">
                        <button
                          onClick={() => { setQaModalType('live'); setIsQaModalOpen(true); }}
                          className="flex-1 flex items-center justify-center gap-2 sm:gap-3 bg-gray-800 border border-gray-700 hover:border-green-500 hover:bg-gray-700 p-3 rounded-xl transition-all shadow-lg group"
                        >
                          <div className="bg-gray-700 group-hover:bg-green-500 p-2.5 rounded-lg transition-colors shadow-inner">
                            <Hand className="w-4 h-4 text-gray-400 group-hover:text-white" />
                          </div>
                          <div className="flex flex-col items-start text-left">
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-white uppercase tracking-widest leading-tight transition-colors">{t('requestFloorBtn1')}</span>
                            <span className="text-[11px] font-bold text-gray-300 group-hover:text-white uppercase tracking-widest leading-tight transition-colors">{t('requestFloorBtn2')}</span>
                          </div>
                        </button>
                        <button
                          onClick={() => { setQaModalType('mailbox'); setIsQaModalOpen(true); }}
                          className="flex-1 flex items-center justify-center gap-2 sm:gap-3 bg-gray-800 border border-gray-700 hover:border-primary hover:bg-gray-700 p-3 rounded-xl transition-all shadow-lg group"
                        >
                          <div className="bg-gray-700 group-hover:bg-primary p-2.5 rounded-lg transition-colors shadow-inner">
                            <MessageSquare className="w-4 h-4 text-gray-400 group-hover:text-white" />
                          </div>
                          <div className="flex flex-col items-start text-left">
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-white uppercase tracking-widest leading-tight transition-colors">{t('writtenQuestionBtn1')}</span>
                            <span className="text-[11px] font-bold text-gray-300 group-hover:text-white uppercase tracking-widest leading-tight transition-colors">{t('writtenQuestionBtn2')}</span>
                          </div>
                        </button>
                    </div>
                  )}

                  {/* QA Pending */}
                  {qaState === 'pending' && (
                    <div className="w-full flex items-center justify-between bg-dark border border-gray-700 p-3.5 rounded-xl shadow-lg animate-pulse">
                       <div className="flex items-center gap-3">
                           <div className="bg-gray-700 p-2.5 rounded-lg">
                               <Hand className="w-4 h-4 text-gray-400" />
                           </div>
                           <div className="flex flex-col">
                               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-tight">{t('status')}</span>
                               <span className="text-xs font-bold text-gray-300 uppercase tracking-widest leading-tight">{t('waitingQueue')}</span>
                           </div>
                       </div>
                       <button onClick={cancelQaRequest} className="bg-gray-800 hover:bg-red-500 text-gray-400 hover:text-white p-2.5 rounded-lg transition-colors shadow-inner">
                         <X className="w-4 h-4" />
                       </button>
                    </div>
                  )}

                  {/* QA Approved */}
                  {qaState === 'approved' && (
                    <div className="w-full flex flex-col gap-3 bg-red-500/10 border border-red-500/30 p-4 rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                       <div className="flex items-center justify-between w-full">
                           <div className="flex items-center gap-3">
                               <div className="bg-red-500 p-2.5 rounded-lg animate-pulse shadow-lg shadow-red-500/50">
                                   <Mic className="w-4 h-4 text-white" />
                               </div>
                               <div className="flex flex-col">
                                   <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest leading-tight">{t('broadcasting')}</span>
                                   <span className="text-xs font-bold text-white uppercase tracking-widest leading-tight">{t('micActive')}</span>
                               </div>
                           </div>
                       </div>
                       <button
                         onClick={cancelQaRequest}
                         className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] sm:text-xs uppercase tracking-widest py-3 rounded-xl shadow-lg border border-red-500 transition-all flex items-center justify-center gap-2"
                       >
                         <Square className="w-4 h-4 fill-current" /> {t('endIntervention')}
                       </button>
                    </div>
                  )}
                </div>
            )}

            <button
              onClick={switchMode}
              className="w-full group relative flex items-center justify-center gap-3 bg-dark border border-gray-700 hover:border-gray-500 p-4 rounded-xl transition-all shadow-lg overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              {userMode === 'text' ? (
                <>
                  <Headphones className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                  <span className="text-gray-300 font-medium tracking-wide">{t('switchToAudio')}</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                  <span className="text-gray-300 font-medium tracking-wide">{t('switchToText')}</span>
                </>
              )}
            </button>

            {eventSponsor && (
                <div className="mt-4 text-[10px] font-bold tracking-widest uppercase text-center w-full">
                    <span className="animate-metallic">{eventSponsor}</span>
                </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-[9px] text-gray-600 font-semibold uppercase tracking-widest text-center w-full opacity-60 hover:opacity-100 transition-opacity">
                <button onClick={() => setLegalModalContent('privacy')} className="hover:text-gray-300 transition-colors">{t('privacy')}</button>
                <span className="text-gray-800">•</span>
                <button onClick={() => setLegalModalContent('terms')} className="hover:text-gray-300 transition-colors">{t('terms')}</button>
                <span className="text-gray-800">•</span>
                <button onClick={() => setLegalModalContent('cookies')} className="hover:text-gray-300 transition-colors">{t('cookies')}</button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};

export default AudienceView;