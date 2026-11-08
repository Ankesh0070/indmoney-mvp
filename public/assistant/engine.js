(function (root, factory) {
  var Data = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.AssistantData;
  var out = factory(Data);
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
  else { root.IntentClassifier = out.IntentClassifier; root.AssistantLanguageService = out.LanguageService; root.SIPContextService = out.SIPContextService; root.AssistantResponseEngine = out.AssistantResponseEngine; }
}(typeof window !== 'undefined' ? window : globalThis, function (Data) {
  'use strict';
  var I = Data.Intent;
  var LANGUAGES = { en:'English',hi:'Hindi',as:'Assamese',bn:'Bengali',brx:'Bodo',doi:'Dogri',gu:'Gujarati',kn:'Kannada',ks:'Kashmiri',kok:'Konkani',mai:'Maithili',ml:'Malayalam',mni:'Manipuri',mr:'Marathi',ne:'Nepali',or:'Odia',pa:'Punjabi',sa:'Sanskrit',sat:'Santali',sd:'Sindhi',ta:'Tamil',te:'Telugu',ur:'Urdu' };
  var LANG_COPY = {
    en:'I can explain the app journey and take you to the right screen. I provide app guidance only, not investment advice.', hi:'मैं ऐप की यात्रा समझाकर आपको सही स्क्रीन पर ले जा सकता हूँ। मैं केवल ऐप संबंधी मार्गदर्शन देता हूँ, निवेश सलाह नहीं।',
    as:'মই এপটোৰ ব্যৱহাৰ বুজাই সঠিক স্ক্ৰীণলৈ লৈ যাব পাৰোঁ। মই কেৱল এপৰ সহায় দিওঁ, বিনিয়োগৰ পৰামৰ্শ নহয়।', bn:'আমি অ্যাপের যাত্রা বুঝিয়ে সঠিক স্ক্রিনে নিয়ে যেতে পারি। আমি শুধু অ্যাপ ব্যবহারে সহায়তা করি, বিনিয়োগের পরামর্শ দিই না।',
    brx:'आं एपखौ बाहायनाय बुजायना थार स्क्रिनआव लांनो हायो। आं एपनि हेफाजाबल’ होयो, लगानि सुबुंथि नङा।', doi:'मैं ऐप दा सफर समझाई सकना ते तुसेंगी ठीक स्क्रीन पर लेई जाई सकना। मैं सिर्फ ऐप दी मदद करदा हां, निवेश सलाह नेईं।',
    gu:'હું એપની મુસાફરી સમજાવીને તમને યોગ્ય સ્ક્રીન પર લઈ જઈ શકું છું. હું માત્ર એપ માટે માર્ગદર્શન આપું છું, રોકાણની સલાહ નહીં.', kn:'ನಾನು ಆ್ಯಪ್ ಬಳಕೆಯನ್ನು ವಿವರಿಸಿ ಸರಿಯಾದ ಪರದೆಗೆ ಕರೆದೊಯ್ಯಬಹುದು. ನಾನು ಆ್ಯಪ್ ಮಾರ್ಗದರ್ಶನ ಮಾತ್ರ ನೀಡುತ್ತೇನೆ, ಹೂಡಿಕೆ ಸಲಹೆಯಲ್ಲ.',
    ks:'بہٕ چھُس ایپُک سفر سمجھاونہٕ تہٕ صحیح سکرینس پٮ۪ٹھ نِنہٕ مدد کران۔ بہٕ چھُس صرف ایپ رہنمائی دِوان، سرمایہ کاری صلاح نہٕ۔', kok:'हांव ऍपाचो प्रवास समजावन तुमकां योग्य स्क्रीनार व्हरूंक शकतां. हांव फकत ऍप मार्गदर्शन दितां, गुंतवणूक सल्लो न्हय.',
    mai:'हम ऐपक यात्रा बुझा कऽ अहाँकेँ सही स्क्रीन पर लऽ जा सकैत छी। हम केवल ऐप संबंधी सहायता दैत छी, निवेश सलाह नहि।', ml:'ആപ്പ് എങ്ങനെ ഉപയോഗിക്കാമെന്ന് വിശദീകരിച്ച് ശരിയായ സ്ക്രീനിലേക്ക് നിങ്ങളെ നയിക്കാം. ആപ്പ് മാർഗനിർദേശം മാത്രമാണ്, നിക്ഷേപ ഉപദേശമല്ല.',
    mni:'ꯑꯩꯅ ꯑꯦꯞ ꯁꯤꯖꯤꯟꯅꯕ ꯇꯥꯛꯄꯤꯗꯨꯅ ꯑꯆꯨꯝꯕ ꯁ꯭ꯀ꯭ꯔꯤꯟꯗ ꯄꯨꯕ ꯌꯥꯏ꯫ ꯃꯁꯤ ꯑꯦꯞ ꯃꯇꯦꯡꯈꯛꯇꯅꯤ, ꯁꯦꯟꯐꯝ ꯄꯤꯕꯒꯤ ꯄꯥꯎꯇꯥꯛ ꯅꯠꯇꯦ꯫', mr:'मी अॅपचा प्रवास समजावून तुम्हाला योग्य स्क्रीनवर नेऊ शकतो. मी फक्त अॅपसंबंधी मार्गदर्शन देतो, गुंतवणूक सल्ला नाही.',
    ne:'म एपको यात्रा बुझाएर तपाईंलाई सही स्क्रिनमा लैजान सक्छु। म एपसम्बन्धी मार्गदर्शन मात्र दिन्छु, लगानी सल्लाह होइन।', or:'ମୁଁ ଆପ୍‌ର ବ୍ୟବହାର ବୁଝାଇ ଆପଣଙ୍କୁ ଠିକ୍ ସ୍କ୍ରିନ୍‌କୁ ନେଇପାରିବି। ମୁଁ କେବଳ ଆପ୍ ମାର୍ଗଦର୍ଶନ ଦିଏ, ନିବେଶ ପରାମର୍ଶ ନୁହେଁ।',
    pa:'ਮੈਂ ਐਪ ਦੀ ਯਾਤਰਾ ਸਮਝਾ ਕੇ ਤੁਹਾਨੂੰ ਸਹੀ ਸਕ੍ਰੀਨ ਤੇ ਲੈ ਜਾ ਸਕਦਾ ਹਾਂ। ਮੈਂ ਸਿਰਫ਼ ਐਪ ਬਾਰੇ ਮਦਦ ਦਿੰਦਾ ਹਾਂ, ਨਿਵੇਸ਼ ਸਲਾਹ ਨਹੀਂ।', sa:'अहं अनुप्रयोगस्य मार्गं बोधयित्वा उचितं पटलं प्रति नेतुं शक्नोमि। केवलम् अनुप्रयोगमार्गदर्शनं ददामि, निवेशपरामर्शं न।',
    sat:'ᱤᱧ ᱮᱯ ᱵᱮᱵᱷᱟᱨ ᱵᱩᱡᱷᱟᱹᱣ ᱠᱟᱛᱮ ᱴᱷᱤᱠ ᱥᱠᱨᱤᱱ ᱛᱮ ᱤᱫᱤ ᱟᱢᱟ᱾ ᱤᱧ ᱮᱯ ᱜᱚᱲᱚ ᱜᱮ ᱮᱢᱟ, ᱯᱩᱸᱡᱤ ᱥᱟᱞᱦᱟ ᱵᱟᱝ᱾', sd:'مان ايپ جو سفر سمجهائي توهان کي صحيح اسڪرين تي وٺي وڃي سگهان ٿو. مان رڳو ايپ بابت رهنمائي ڏيان ٿو، سيڙپڪاري جي صلاح نه.',
    ta:'ஆப்பை எப்படிப் பயன்படுத்துவது என்று விளக்கி சரியான திரைக்கு அழைத்துச் செல்ல முடியும். நான் ஆப் வழிகாட்டுதல் மட்டுமே தருகிறேன்; முதலீட்டு ஆலோசனை அல்ல.', te:'యాప్‌ను ఎలా ఉపయోగించాలో వివరించి సరైన స్క్రీన్‌కు తీసుకెళ్లగలను. నేను యాప్ మార్గదర్శనం మాత్రమే ఇస్తాను, పెట్టుబడి సలహా కాదు.', ur:'میں ایپ کا سفر سمجھا کر آپ کو درست اسکرین پر لے جا سکتا ہوں۔ میں صرف ایپ کی رہنمائی دیتا ہوں، سرمایہ کاری کا مشورہ نہیں۔'
  };
  function detectLanguage(text) { var s=String(text||''),c='en',q=.96;
    if(/[\u1C50-\u1C7F]/.test(s))c='sat'; else if(/[\uABC0-\uABFF]/.test(s))c='mni'; else if(/[\u0B80-\u0BFF]/.test(s))c='ta'; else if(/[\u0C00-\u0C7F]/.test(s))c='te'; else if(/[\u0C80-\u0CFF]/.test(s))c='kn'; else if(/[\u0D00-\u0D7F]/.test(s))c='ml'; else if(/[\u0B00-\u0B7F]/.test(s))c='or'; else if(/[\u0A80-\u0AFF]/.test(s))c='gu'; else if(/[\u0A00-\u0A7F]/.test(s))c='pa';
    else if(/[\u0980-\u09FF]/.test(s)){c=/[ৰৱ]|অসম|মই/.test(s)?'as':'bn';q=.84;} else if(/[\u0600-\u06FF]/.test(s)){c=/[ٽٺڊڙڳڻ]|سنڌ/.test(s)?'sd':/[ٲٳٴٮۄۅ۪]|کٔ/.test(s)?'ks':'ur';q=.8;}
    else if(/[\u0900-\u097F]/.test(s)){c=/अहं|भवतः|अनुप्रयोगस्य/.test(s)?'sa':/छी|अहाँ|कऽ/.test(s)?'mai':/आं|बाहाय/.test(s)?'brx':/हांव|तुमकां|न्हय/.test(s)?'kok':/तुसेंगी|नेईं/.test(s)?'doi':/तपाईं|होइन/.test(s)?'ne':/आहे|मला|तुम्हाला/.test(s)?'mr':'hi';q=c==='hi'?.72:.88;}
    else if(/\b(kya|kaise|mujhe|mera|samjhao|nahi|hai|karna|gaya)\b/i.test(s)){c='hi';q=.76;}
    return{code:c,name:c==='hi'&&/^[\x00-\x7F]*$/.test(s)?'Hindi (Roman)':LANGUAGES[c],confidence:q}; }
  var RULES = {};
  RULES[I.PAYMENT_FAILURE] = [/\b(fail(?:ed|ure)?|declin(?:ed|e)|payment.*not.*work|sip fail ho gaya|payment.*kya hua)\b/i];
  RULES[I.SCHEDULE_MISMATCH] = [/\b(salary.*(?:late|after|7th)|date.*(?:change|mismatch|not work)|change.*(?:sip )?date|debit date|salary late aati hai)\b/i];
  RULES[I.PAUSE_REQUEST] = [/\b(pause|skip.*month|cannot afford|can't afford|temporary stop|rokna)\b/i];
  RULES[I.MANDATE_PROBLEM] = [/\b(autopay|mandate|authori[sz]ation|bank approval|nahi chal raha|expired)\b/i];
  RULES[I.CASHFLOW_VISIBILITY] = [/\b(how much|kitna|due|scheduled|commitment|next week|this month|cash.?flow)\b/i];
  RULES[I.INVESTMENT_EDUCATION] = [/\b(loss|losing|negative|return|market|portfolio value|understand sip|how sip works|recommend|which.*fund|should i (?:buy|invest))\b/i];
  RULES[I.DISCONTINUATION_INTENT] = [/\b(cancel|permanent(?:ly)? stop|discontinue|band karna|close.*sip)\b/i];
  RULES[I.APP_JOURNEY] = [/\b(app.*(?:use|journey|work|samjha|kaise)|how.*(?:use|navigate|start)|where.*(?:find|go)|kahan|kidhar|screen|feature|dashboard|my sips|sip tools|start sip|journey samjhao)\b/i];
  RULES[I.GENERAL_SIP_SUPPORT] = [/\b(help|support|issue|problem|provider unavailable)\b/i];

  function clean(text) {
    return String(text || '').replace(/\b(?:otp|upi\s*pin|password|cvv)\s*[:=-]?\s*\S+/gi, '[sensitive detail removed]').replace(/\b\d{9,19}\b/g, '[number removed]').slice(0, 500).trim();
  }
  function classify(text) {
    var safe = clean(text), found = [], language=detectLanguage(safe);
    Object.keys(RULES).forEach(function (intent) { if (RULES[intent].some(function (r) { return r.test(safe); })) found.push(intent); });
    // Direct-action or prompt-injection wording never changes the allowlisted routing result.
    var unsafeAction = /\b(debit|execute|ignore.*instruction|change records|bypass|send otp|use my pin)\b/i.test(safe);
    if (!safe) return { primary: I.UNKNOWN_INTENT, intents: [], confidence: 0, ambiguous: true, safeText: safe, language:language, reason: 'empty' };
    if (!found.length && language.code!=='en' && /(?:app|dashboard|screen|SIP|एसआईपी|எஸ்ஐபி|ఎస్ఐపి|ਐਸਆਈਪੀ|এসআইপি|ଏସଆଇପି|എസ്ഐപി)/i.test(safe)) found.push(I.APP_JOURNEY);
    if (!found.length) return { primary: I.UNKNOWN_INTENT, intents: [], confidence: 0.15, ambiguous: true, safeText: safe, language:language, unsafeAction: unsafeAction, reason: 'no matching support pattern' };
    return { primary: found[0], intents: found, confidence: found.length === 1 ? 0.92 : 0.72, ambiguous: found.length > 1, safeText: safe, language:language, unsafeAction: unsafeAction, reason: 'matched explicit deterministic support patterns' };
  }

  function SIPContextService(deps) { this.deps = deps || {}; }
  SIPContextService.prototype.getSips = function () {
    var r = this.deps.recoveryStore;
    return r && r.getAllSips ? r.getAllSips().map(function (s) { return { id:s.id, fundName:s.fundName, amountPaise:s.amountPaise || (s.amount || 0) * 100, status:s.status || 'unknown', mandateId:s.mandateId || null }; }) : [];
  };
  SIPContextService.prototype.snapshot = function (sipId) {
    var d=this.deps, r=d.recoveryStore, sip=r&&r.getSip?r.getSip(sipId):this.getSips().find(function(s){return s.id===sipId;});
    if (!sip) return { sipId:sipId || null, source:'Verified simulated records', missing:true, unknown:['SIP record'] };
    var insts=r&&r.getInstalmentsForSip?r.getInstalmentsForSip(sipId):[];
    var failed=insts.find(function(x){return String(x.status).toLowerCase()==='failed';}) || null;
    var mandate=r&&r.getMandateForSip?r.getMandateForSip(sipId):null;
    var schedule=d.schedulingStore&&d.schedulingStore.getCurrentDebitDay?d.schedulingStore.getCurrentDebitDay(sipId):null;
    var pause=d.pauseStore&&d.pauseStore.getLifecycle?d.pauseStore.getLifecycle(sipId):'unknown';
    var upcoming=d.cashflowStore&&d.cashflowStore.getBreakdown?d.cashflowStore.getBreakdown(7):null;
    return { sipId:sipId, fundName:sip.fundName, amountPaise:sip.amountPaise || (sip.amount||0)*100, lifecycle:pause,
      failedInstalment:failed ? { id:failed.id, amountPaise:failed.amountPaise || (failed.amount||0)*100, status:failed.status, reason:failed.failureReason || failed.reason || null } : null,
      mandate:mandate ? { id:mandate.id, status:mandate.status } : null, effectiveDebitDay:schedule,
      upcoming7DaysPaise:upcoming && typeof upcoming.totalPaise==='number' ? upcoming.totalPaise : null,
      source:'Verified simulated records', capturedAt:new Date().toISOString() };
  };

  function money(p) { return '₹' + Math.round((p || 0)/100).toLocaleString('en-IN'); }
  var GUIDE = [
    { id:'guide-home', terms:['home','dashboard','start','app','journey','navigate'], text:'Home gives you a portfolio summary and shortcuts. Open My SIPs to see every SIP support tool in one place.', toolId:'sips', title:'Open My SIPs', button:'Open My SIPs' },
    { id:'guide-recovery', terms:['failed','failure','payment','retry','debit'], text:'For a failed SIP instalment, open SIP Recovery to read the recorded failure status and review permitted recovery options. The assistant never retries a payment.', toolId:'recovery', title:'Failed SIP Recovery', button:'Open SIP Recovery' },
    { id:'guide-schedule', terms:['salary','date','schedule','timing','late'], text:'Salary-Aligned Scheduling compares the effective SIP debit day with an optional expected income date. Any change still needs confirmation in that workflow.', toolId:'scheduling', title:'Salary-Aligned Scheduling', button:'Review SIP Schedule' },
    { id:'guide-pause', terms:['pause','resume','afford','month','temporary'], text:'Pause & Resume Manager shows provider eligibility, protected instalments, approval status, and resume requirements without pausing anything automatically.', toolId:'pause', title:'Pause & Resume Manager', button:'Manage Pause & Resume' },
    { id:'guide-mandate', terms:['autopay','mandate','authorization','bank'], text:'AutoPay Health explains mandate readiness separately from payment success and routes repairs through the authorized mandate workflow.', toolId:'mandate', title:'AutoPay Health', button:'Check AutoPay Health' },
    { id:'guide-cashflow', terms:['due','cashflow','commitment','upcoming','amount','kitna'], text:'Cash-Flow Planner shows upcoming simulated SIP commitments and optional self-reported estimates. It never claims to know your bank balance.', toolId:'cashflow', title:'Cash-Flow Planner', button:'Open Cash-Flow Planner' },
    { id:'guide-education', terms:['learn','loss','return','value','understand','education'], text:'My First-Year SIP Journey explains contributions, units, NAV, and value changes with neutral simulated examples, without recommending investments.', toolId:'education', title:'First-Year SIP Journey', button:'Understand My SIP Journey' },
    { id:'guide-cancel', terms:['cancel','stop','discontinue','feedback'], text:'SIP Continuity Insights provides a direct simulated cancellation route. Feedback is optional and never blocks cancellation.', toolId:'discontinuation', title:'SIP Continuity Insights', button:'Manage or Cancel SIP' }
  ];
  function retrieveGuide(text) { var words=String(text||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return GUIDE.map(function(d){var score=d.terms.reduce(function(n,t){return n+(words.some(function(w){return t.indexOf(w)>=0||w.indexOf(t)>=0;})?1:0);},0);return{doc:d,score:score};}).sort(function(a,b){return b.score-a.score;}).filter(function(x){return x.score>0;}).slice(0,2); }
  function respond(result, ctx) {
    var intent=result.primary, route=Data.ROUTES[intent] || null, text='',language=result.language||detectLanguage(result.safeText),localized=LANG_COPY[language.code];
    if (result.unsafeAction) text='I cannot execute payments or change financial records from chat. ';
    if (result.ambiguous && result.intents.length > 1) return { text:text+'I found more than one possible issue. Which would you like to address first?', intents:result.intents, clarification:true, source:null, card:null };
    if (intent===I.UNKNOWN_INTENT) return { text:language.code==='en'?text+'I could not confidently identify the issue from that message. I will not guess. You can rephrase it or contact support.':localized, clarification:true, source:null, language:language, card:{toolId:'support',title:'Contact Support',button:'Get Support'} };
    if (intent===I.PAYMENT_FAILURE) text += ctx.failedInstalment ? ('Your '+money(ctx.failedInstalment.amountPaise)+' SIP instalment is marked failed'+(ctx.failedInstalment.reason?' due to '+ctx.failedInstalment.reason+'.':'. The recorded reason is unknown, so I will not guess.')) : 'I could not find a verified failed instalment for the selected SIP.';
    else if (intent===I.SCHEDULE_MISMATCH) text += ctx.effectiveDebitDay ? 'This SIP currently has an effective debit day of '+ctx.effectiveDebitDay+'. Any change must be requested through the scheduling workflow.' : 'The effective debit date is unavailable, so I cannot confirm a mismatch.';
    else if (intent===I.PAUSE_REQUEST) text += 'You can review provider-supported pause or resume options without changing the SIP from this chat.';
    else if (intent===I.MANDATE_PROBLEM) text += ctx.mandate ? 'The mandate is recorded as '+ctx.mandate.status+'. Mandate readiness and payment success are separate statuses.' : 'No verified mandate record is available, so I cannot identify an authorization cause.';
    else if (intent===I.CASHFLOW_VISIBILITY) text += ctx.upcoming7DaysPaise != null ? 'Scheduled SIP commitments over the next seven days are '+money(ctx.upcoming7DaysPaise)+'. This is a projection, not a bank balance.' : 'A verified seven-day commitment projection is not available. I will not invent a balance.';
    else if (intent===I.INVESTMENT_EDUCATION) text += 'Mutual fund values can rise or fall with market conditions. A SIP does not guarantee positive returns, and I cannot recommend a fund or predict returns.';
    else if (intent===I.DISCONTINUATION_INTENT) text += 'You can manage or cancel the SIP directly. Sharing a reason is optional and will never block cancellation.';
    else if (intent===I.APP_JOURNEY) { var hits=retrieveGuide(result.safeText),top=hits[0]&&hits[0].doc; text += language.code==='en'?(top ? top.text : GUIDE[0].text):localized; route=top?{toolId:top.toolId,title:top.title,button:top.button}:Data.ROUTES[intent]; return { text:text, clarification:false, source:'INDmoney prototype app guide', citations:hits.map(function(h){return h.doc.id;}), language:language, card:route, intents:[intent] }; }
    else text += 'I can help with SIP payments, schedules, AutoPay, pauses, cash-flow questions, education, or cancellation.';
    if(language.code!=='en' && localized) text=localized;
    return { text:text, clarification:false, source:ctx && ctx.source, language:language, card:route, intents:[intent] };
  }
  return { IntentClassifier:{ classify:classify, sanitize:clean }, LanguageService:{detect:detectLanguage,supported:LANGUAGES}, SIPContextService:SIPContextService, AssistantResponseEngine:{ respond:respond, retrieveGuide:retrieveGuide }, GuideKnowledgeBase:GUIDE };
}));
