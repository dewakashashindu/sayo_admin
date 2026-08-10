/* ─────────────────────────────────────────────────────────────────────────────
   TRILINGUAL TRANSLATIONS — English / සිංහල / தமிழ்
   Covers every user-visible string in:
     • app/booking/page.tsx
     • components/ConflictModal.tsx

   HOW TO REVIEW: each line shows all 3 languages side by side  →  en | si | ta
   HOW TO USE:    t('key')          → translated string
                  t('key', {vars}) → string with {placeholders} filled in
                  svc(lang, name)  → translated service name (lookup by English)
                  role/cat/loc()   → translated role / category / location name
───────────────────────────────────────────────────────────────────────────── */

export type Lang = 'en' | 'si' | 'ta';

export const translations: Record<string, { en: string; si: string; ta: string }> = {

  /* ─────────── PAGE HEADER ─────────── */
  'header.onlineBooking':    { en: 'Online Booking',                                  si: 'මාර්ගගත වෙන්කිරීම',                             ta: 'ஆன்லைன் முன்பதிவு' },
  'header.title1':           { en: 'Reserve Your',                                    si: 'ඔබේ',                                          ta: 'உங்கள்' },
  'header.title2':           { en: 'Luxury',                                          si: 'සුඛෝපභෝගී',                                    ta: 'சொகுசு' },
  'header.title3':           { en: 'Moment',                                          si: 'මොහොත වෙන්කරගන්න',                            ta: 'தருணத்தை முன்பதிவு செய்யுங்கள்' },
  'header.confirmEmailNote': { en: "✦ We'll confirm your appointment via email.",     si: '✦ අපි ඔබේ වෙන්කිරීම විද්‍යුත් තැපෑල මගින් තහවුරු කරන්නෙමු.', ta: '✦ உங்கள் நியமனத்தை மின்னஞ்சல் வழியாக உறுதிப்படுத்துவோம்.' },
  'header.instantNote':      { en: '✦ Instant registration — no email needed.',       si: '✦ ක්ෂණික ලියාපදිංචිය — විද්‍යුත් තැපෑල අවශ්‍ය නැත.',        ta: '✦ உடனடி பதிவு — மின்னஞ்சல் தேவையில்லை.' },

  /* ─────────── STEP INDICATOR ─────────── */
  'steps.one':               { en: 'Your Appointment',                                si: 'ඔබේ වෙන්කිරීම',                                ta: 'உங்கள் நியமனம்' },
  'steps.two':               { en: 'Review & Confirm',                                si: 'සමාලෝචනය සහ තහවුරු කිරීම',                    ta: 'மதிப்பாய்வு & உறுதி' },

  /* ─────────── BOOKING MODE ─────────── */
  'mode.with':               { en: 'With Confirmation',                               si: 'තහවුරු කිරීම සමඟ',                            ta: 'உறுதிப்படுத்தலுடன்' },
  'mode.without':            { en: 'Without Confirmation',                            si: 'තහවුරු කිරීමකින් තොරව',                       ta: 'உறுதிப்படுத்தல் இல்லாமல்' },
  'mode.confirmedBadge':     { en: 'Confirmed',                                       si: 'තහවුරු කර ඇත',                                ta: 'உறுதிப்படுத்தப்பட்டது' },

  /* ─────────── GENDER + PHONE ─────────── */
  'gp.gender':               { en: 'Gender',                                          si: 'ස්ත්‍රී පුරුෂ භාවය',                           ta: 'பாலினம்' },
  'gp.contact':              { en: 'Contact Number',                                  si: 'දුරකථන අංකය',                                 ta: 'தொடர்பு எண்' },
  'gp.required':             { en: 'Required',                                        si: 'අවශ්‍ය වේ',                                     ta: 'தேவை' },
  'gp.selectGender':         { en: 'Select gender…',                                  si: 'ස්ත්‍රී පුරුෂ භාවය තෝරන්න…',                    ta: 'பாலினத்தைத் தேர்வுசெய்க…' },
  'gp.selectGenderTitle':    { en: 'Select gender',                                   si: 'ස්ත්‍රී පුරුෂ භාවය තෝරන්න',                     ta: 'பாலினத்தைத் தேர்ந்தெடுக்கவும்' },
  'gender.male':             { en: 'Male',                                            si: 'පිරිමි',                                       ta: 'ஆண்' },
  'gender.female':           { en: 'Female',                                          si: 'ගැහැණු',                                       ta: 'பெண்' },
  'gender.prefer_not_to_say':{ en: 'Prefer not to say',                               si: 'පැවසීමට අකමැති',                              ta: 'சொல்ல விரும்பவில்லை' },
  'gender.other':            { en: 'Other',                                           si: 'වෙනත්',                                        ta: 'மற்றது' },

  /* ─────────── STEP 1 — BUILD APPOINTMENT ─────────── */
  's1.buildYourAppointment': { en: 'Build Your Appointment',                          si: 'ඔබේ වෙන්කිරීම සාදන්න',                         ta: 'உங்கள் நியமனத்தை உருவாக்குங்கள்' },
  's1.intro':                { en: 'Choose your branch, services, provider, date and time.', si: 'ඔබේ ශාඛාව, සේවාවන්, සේවා සැපයුම්කරු, දිනය සහ වේලාව තෝරන්න.', ta: 'உங்கள் கிளை, சேவைகள், வழங்குநர், தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுக்கவும்.' },
  's1.branchLocation':       { en: 'Branch / Location',                               si: 'ශාඛාව / ස්ථානය',                                ta: 'கிளை / இடம்' },
  's1.category':             { en: 'Category',                                        si: 'කාණ්ඩය',                                       ta: 'வகை' },
  's1.chooseServices':       { en: 'Choose Services',                                 si: 'සේවාවන් තෝරන්න',                               ta: 'சேவைகளைத் தேர்ந்தெடுக்கவும்' },
  's1.tapToSelect':          { en: 'Tap to select. You can pick multiple across categories.', si: 'තේරීමට ඔබන්න. කාණ්ඩ කිහිපයකින් සේවා කිහිපයක් තෝරාගත හැක.', ta: 'தேர்வு செய்ய தட்டவும். பல வகைகளிலிருந்து பல சேவைகளைத் தேர்ந்தெடுக்கலாம்.' },
  's1.serviceProvider':      { en: 'Service Provider',                                si: 'සේවා සැපයුම්කරු',                              ta: 'சேவை வழங்குநர்' },
  's1.selectBranchFirst':    { en: 'Please select a branch above to see available providers.', si: 'ලබාගත හැකි සේවා සැපයුම්කරුවන් බැලීමට කරුණාකර ඉහත ශාඛාවක් තෝරන්න.', ta: 'கிடைக்கும் வழங்குநர்களைப் பார்க்க மேலே ஒரு கிளையைத் தேர்ந்தெடுக்கவும்.' },
  's1.noProvidersFor':       { en: 'No providers for {cats} at {loc}.',               si: '{loc} ශාඛාවේ {cats} සඳහා සේවා සැපයුම්කරුවන් නැත.', ta: '{loc} இல் {cats} சேவைகளுக்கான வழங்குநர்கள் இல்லை.' },
  's1.showingSpecialistsFor':{ en: 'Showing specialists for {cats} at {loc}',         si: '{loc} ශාඛාවේ {cats} සඳහා විශේෂඥයින්',            ta: '{loc} கிளையில் {cats} சேவைகளுக்கான நிபுணர்கள்' },
  's1.multiProviderInfo':    { en: "You've selected {n} providers. Time slots show partial availability when only some are free.",
                               si: 'ඔබ සේවා සැපයුම්කරුවන් {n} දෙනෙකු තෝරා ඇත. සමහරු පමණක් නිදහස් වූ විට වේලාවන් අර්ධ ලබාගත හැකි ලෙස පෙන්වයි.',
                               ta: 'நீங்கள் {n} வழங்குநர்களைத் தேர்ந்தெடுத்துள்ளீர்கள். சிலர் மட்டுமே இலவசமாக இருக்கும்போது நேரங்கள் பகுதி கிடைக்கும் நிலையைக் காட்டும்.' },
  's1.preferredDate':        { en: 'Preferred Date',                                  si: 'කාමති දිනය',                                   ta: 'விரும்பிய தேதி' },
  's1.missingBranch':        { en: 'Select a branch',                                 si: 'ශාඛාවක් තෝරන්න',                               ta: 'கிளையைத் தேர்ந்தெடுக்கவும்' },
  's1.missingGender':        { en: 'Select your gender',                              si: 'ඔබේ ස්ත්‍රී පුරුෂ භාවය තෝරන්න',                  ta: 'உங்கள் பாலினத்தைத் தேர்ந்தெடுக்கவும்' },
  's1.missingPhone':         { en: 'Enter your phone number',                         si: 'ඔබේ දුරකථන අංකය ඇතුළත් කරන්න',                  ta: 'உங்கள் தொலைபேசி எண்ணை உள்ளிடவும்' },
  's1.missingServices':      { en: 'Choose at least one service',                     si: 'අවම වශයෙන් එක් සේවයක්වත් තෝරන්න',                ta: 'குறைந்தது ஒரு சேவையையாவது தேர்ந்தெடுக்கவும்' },
  's1.missingProvider':      { en: 'Choose a provider',                               si: 'සේවා සැපයුම්කරුවෙකු තෝරන්න',                   ta: 'ஒரு வழங்குநரைத் தேர்ந்தெடுக்கவும்' },
  's1.missingMatch':         { en: 'Number of providers must match number of services ({p} provider(s), {s} service(s))',
                               si: 'සේවා සැපයුම්කරුවන් සංඛ්‍යාව සේවා සංඛ්‍යාවට සමාන විය යුතුය (සැපයුම්කරුවන් {p} දෙනෙක්, සේවා {s}ක්)',
                               ta: 'வழங்குநர் எண்ணிக்கை சேவை எண்ணிக்கைக்கு சமமாக இருக்க வேண்டும் ({p} வழங்குநர்கள், {s} சேவைகள்)' },
  's1.missingDate':          { en: 'Pick a date',                                     si: 'දිනයක් තෝරන්න',                                ta: 'தேதியைத் தேர்ந்தெடுக்கவும்' },
  's1.missingTime':          { en: 'Pick a time slot',                                si: 'වේලාවක් තෝරන්න',                               ta: 'ஒரு நேரத்தைத் தேர்ந்தெடுக்கவும்' },
  's1.reviewBooking':        { en: 'Review Booking',                                  si: 'වෙන්කිරීම සමාලෝචනය',                           ta: 'முன்பதிவை மதிப்பாய்வு செய்' },

  /* ─────────── TIME SECTION ─────────── */
  'time.preferredTime':      { en: 'Preferred Time',                                  si: 'කැමති වේලාව',                                  ta: 'விரும்பிய நேரம்' },
  'time.checking':           { en: 'Checking live availability…',                     si: 'සජීවී ලබාගත හැකි බව පරීක්ෂා කරමින්…',             ta: 'நேரடி கிடைக்கும் நிலையைச் சரிபார்க்கிறது…' },
  'time.needProvider':       { en: 'Please select a provider above to see real-time availability.', si: 'සජීවී ලබාගත හැකි බව බැලීමට කරුණාකර ඉහතින් සේවා සැපයුම්කරුවෙකු තෝරන්න.', ta: 'நிகழ்நேர கிடைக்கும் நிலையைப் பார்க்க மேலே ஒரு வழங்குநரைத் தேர்ந்தெடுக்கவும்.' },
  'time.loadError':          { en: 'Could not load live availability.',               si: 'සජීවී ලබාගත හැකි බව ලබාගත නොහැකි විය.',           ta: 'நேரடி கிடைக்கும் நிலையை ஏற்ற முடியவில்லை.' },
  'time.available':          { en: 'Available',                                       si: 'ලබාගත හැක',                                    ta: 'கிடைக்கும்' },
  'time.partial':            { en: 'Partial',                                         si: 'අර්ධ',                                          ta: 'பகுதி' },
  'time.fullyBooked':        { en: 'Fully Booked',                                    si: 'සම්පූර්ණයෙන් වෙන් කර ඇත',                       ta: 'முழுமையாக முன்பதிவு செய்யப்பட்டது' },
  'time.booked':             { en: 'Booked',                                          si: 'වෙන් කර ඇත',                                    ta: 'முன்பதிவு செய்யப்பட்டது' },
  'time.swapTip':            { en: 'Swap service order for a seamless visit',         si: 'බාධාවකින් තොර පැමිණීමක් සඳහා සේවා අනුක්‍රමය මාරු කරන්න', ta: 'தடையற்ற வருகைக்கு சேவை வரிசையை மாற்றவும்' },
  'time.partialTip':         { en: 'Partial availability — tap for options',          si: 'අර්ධ ලබාගත හැකි බව — විකල්ප සඳහා ඔබන්න',          ta: 'பகுதி கிடைக்கும் நிலை — விருப்பங்களுக்குத் தட்டவும்' },
  'time.yellowHint':         { en: 'Yellow slots: tap for options.',                  si: 'කහ පාට වේලාවන්: විකල්ප සඳහා ඔබන්න.',              ta: 'மஞ்சள் நேரங்கள்: விருப்பங்களுக்குத் தட்டவும்.' },
  'time.swapEquals':         { en: '= swap service order for a seamless visit.',      si: '= බාධාවකින් තොර පැමිණීමක් සඳහා අනුක්‍රමය මාරු කිරීම.', ta: '= தடையற்ற வருகைக்கு சேவை வரிசையை மாற்றுதல்.' },

  /* ─────────── STEP 2 — REVIEW ─────────── */
  's2.reviewYourBooking':    { en: 'Review Your Booking',                             si: 'ඔබේ වෙන්කිරීම සමාලෝචනය කරන්න',                  ta: 'உங்கள் முன்பதிவை மதிப்பாய்வு செய்யுங்கள்' },
  's2.confirmLooksRight':    { en: 'Confirm everything looks right before we lock it in.', si: 'අවසන් කිරීමට පෙර සියල්ල නිවැරදි දැයි තහවුරු කරගන්න.', ta: 'இறுதி செய்வதற்கு முன் எல்லாம் சரியாக உள்ளதா என்று உறுதி செய்யுங்கள்.' },
  's2.walkinBox':            { en: 'Registering without confirmation. No email sent. Please arrive at least 5 minutes early.',
                               si: 'තහවුරු කිරීමකින් තොරව ලියාපදිංචි කෙරේ. විද්‍යුත් තැපෑලක් එවනු නොලැබේ. කරුණාකර අවම වශයෙන් මිනිත්තු 5කට කලින් පැමිණෙන්න.',
                               ta: 'உறுதிப்படுத்தல் இல்லாமல் பதிவு செய்யப்படுகிறது. மின்னஞ்சல் அனுப்பப்படாது. குறைந்தது 5 நிமிடங்களுக்கு முன் வாருங்கள்.' },
  'sum.name':                { en: 'Name',                                            si: 'නම',                                           ta: 'பெயர்' },
  'sum.phone':               { en: 'Phone',                                           si: 'දුරකථනය',                                      ta: 'தொலைபேசி' },
  'sum.email':               { en: 'Email',                                           si: 'විද්‍යුත් තැපෑල',                                 ta: 'மின்னஞ்சல்' },
  'sum.gender':              { en: 'Gender',                                          si: 'ස්ත්‍රී පුරුෂ භාවය',                           ta: 'பாலினம்' },
  'sum.branch':              { en: 'Branch',                                          si: 'ශාඛාව',                                        ta: 'கிளை' },
  'sum.services':            { en: 'Service(s)',                                      si: 'සේවා',                                         ta: 'சேவை(கள்)' },
  'sum.duration':            { en: 'Duration',                                        si: 'කාලසීමාව',                                     ta: 'கால அளவு' },
  'sum.providers':           { en: 'Provider(s)',                                     si: 'සේවා සැපයුම්කරු(වන්)',                         ta: 'வழங்குநர்(கள்)' },
  'sum.date':                { en: 'Date',                                            si: 'දිනය',                                         ta: 'தேதி' },
  'sum.time':                { en: 'Time',                                            si: 'වේලාව',                                        ta: 'நேரம்' },
  's2.totalPrice':           { en: 'Total Price',                                     si: 'මුළු මිල',                                     ta: 'மொத்த விலை' },
  's2.specialRequests':      { en: 'Special Requests',                                si: 'විශේෂ ඉල්ලීම්',                                ta: 'சிறப்புக் கோரிக்கைகள்' },
  's2.optional':             { en: '(optional)',                                      si: '(අත්‍යවශ්‍ය නොවේ)',                              ta: '(விருப்பம்)' },
  's2.notesPlaceholder':     { en: 'Allergies, preferences, or anything else…',       si: 'ඇලර්ජි, කැමැත්ත, හෝ වෙනත් ඕනෑම දෙයක්…',           ta: 'ஒவ்வாமை, விருப்பங்கள், அல்லது வேறு ஏதேனும்…' },
  's2.walkinPolicy':         { en: 'Registrations are first-come-first-served. Please arrive on time. Payment collected at salon.',
                               si: 'ලියාපදිංචි කිරීම් පළමුව පැමිණි අයට මුල් තැන දෙන පදනමින් සලකනු ලැබේ. කරුණාකර වෙලාවට පැමිණෙන්න. ගෙවීම සලෝනයේදී අය කෙරේ.',
                               ta: 'பதிவுகள் முதலில் வருவோருக்கு முன்னுரிமை அளிக்கப்படும். நேரத்திற்கு வாருங்கள். கட்டணம் நிலையத்தில் செலுத்தலாம்.' },
  's2.confirmPolicy':        { en: 'Payment is collected at the salon. Please notify us at least 24 hours in advance to cancel or reschedule.',
                               si: 'ගෙවීම සලෝනයේදී අය කෙරේ. අවලංගු කිරීමට හෝ වෙනත් දවසකට මාරු කිරීමට කරුණාකර පැය 24කට කලින් අපට දන්වන්න.',
                               ta: 'கட்டணம் நிலையத்தில் செலுத்தப்படும். ரத்து செய்ய அல்லது மாற்றியமைக்க குறைந்தது 24 மணி நேரத்திற்கு முன் எங்களுக்குத் தெரியப்படுத்துங்கள்.' },
  's2.back':                 { en: '← Back',                                          si: '← ආපසු',                                       ta: '← பின்செல்' },
  's2.confirmBooking':       { en: 'Confirm Booking',                                 si: 'වෙන්කිරීම තහවුරු කරන්න',                       ta: 'முன்பதிவை உறுதிப்படுத்து' },
  's2.registerWithout':      { en: 'Register Without Confirmation',                   si: 'තහවුරු කිරීමකින් තොරව ලියාපදිංචි කරන්න',          ta: 'உறுதிப்படுத்தல் இல்லாமல் பதிவு செய்' },
  's2.confirming':           { en: 'Confirming…',                                     si: 'තහවුරු කරමින්…',                               ta: 'உறுதிப்படுத்துகிறது…' },
  's2.registering':          { en: 'Registering…',                                    si: 'ලියාපදිංචි කරමින්…',                           ta: 'பதிவு செய்கிறது…' },

  /* ─────────── SUCCESS SCREEN ─────────── */
  'ok.bookingId':            { en: 'Booking ID',                                      si: 'වෙන්කිරීමේ අංකය',                              ta: 'முன்பதிவு எண்' },
  'ok.bookingWord':          { en: 'Booking',                                         si: 'වෙන්කිරීම',                                    ta: 'முன்பதிவு' },
  'ok.confirmedWord':        { en: 'Confirmed',                                       si: 'තහවුරු කරන ලදී',                               ta: 'உறுதிப்படுத்தப்பட்டது' },
  'ok.registeredWord':       { en: 'Registered',                                      si: 'ලියාපදිංචි කරන ලදී',                           ta: 'பதிவு செய்யப்பட்டது' },
  'ok.seeYouSoon':           { en: 'See you soon, {name}!',                           si: 'ඉක්මනින් හමුවෙමු, {name}!',                    ta: 'விரைவில் சந்திப்போம், {name}!' },
  'ok.onDate':               { en: 'on {date}',                                       si: '{date} දින',                                   ta: '{date} அன்று' },
  'ok.atTime':               { en: 'at {time}',                                       si: '{time} වෙලාවට',                                ta: '{time} மணிக்கு' },
  'ok.withProvs':            { en: 'with {provs}',                                    si: '{provs} සමඟ',                                  ta: '{provs} உடன்' },
  'ok.atOurBranch':          { en: 'at our {loc} branch.',                            si: 'අපගේ {loc} ශාඛාවේදී.',                         ta: 'எங்கள் {loc} கிளையில்.' },
  'ok.walkinNote':           { en: 'Registered without confirmation — please arrive on time.', si: 'තහවුරු කිරීමකින් තොරව ලියාපදිංචි කරන ලදී — කරුණාකර වෙලාවට පැමිණෙන්න.', ta: 'உறுதிப்படுத்தல் இல்லாமல் பதிவு செய்யப்பட்டது — நேரத்திற்கு வாருங்கள்.' },
  'ok.confirmationSentTo':   { en: 'Confirmation sent to {email}',                    si: 'තහවුරු කිරීම {email} වෙත යවන ලදි',               ta: 'உறுதிப்படுத்தல் {email} க்கு அனுப்பப்பட்டது' },
  'ok.bookAnother':          { en: 'Book Another Appointment',                        si: 'තවත් වෙන්කිරීමක් කරන්න',                        ta: 'மற்றொரு நியமனத்தை முன்பதிவு செய்' },

  /* ─────────── CALENDAR ─────────── */
  'cal.today':               { en: 'Today',                                           si: 'අද',                                           ta: 'இன்று' },
  'cal.clear':               { en: 'Clear',                                           si: 'මකන්න',                                        ta: 'அழி' },
  'cal.clearDate':           { en: 'Clear date',                                      si: 'දිනය මකන්න',                                   ta: 'தேதியை அழி' },
  'cal.close':               { en: 'Close',                                           si: 'වසන්න',                                        ta: 'மூடு' },
  'cal.selectDate':          { en: 'Select a date…',                                  si: 'දිනයක් තෝරන්න…',                               ta: 'தேதியைத் தேர்ந்தெடுக்கவும்…' },
  'cal.prevMonth':           { en: 'Previous month',                                  si: 'පෙර මාසය',                                     ta: 'முந்தைய மாதம்' },
  'cal.nextMonth':           { en: 'Next month',                                      si: 'මීළඟ මාසය',                                    ta: 'அடுத்த மாதம்' },

  /* ─────────── ERRORS ─────────── */
  'err.generic':             { en: 'Something went wrong.',                           si: 'යම් වරදක් සිදු විය.',                          ta: 'ஏதோ தவறு நடந்துவிட்டது.' },
  'err.network':             { en: 'Network error — please check your connection.',   si: 'ජාල දෝෂයකි — කරුණාකර ඔබේ සම්බන්ධතාවය පරීක්ෂා කරන්න.', ta: 'வலைப்பின்னல் பிழை — உங்கள் இணைப்பைச் சரிபார்க்கவும்.' },
  'err.slotTaken':           { en: '{slot} was just taken. Please pick another slot.', si: '{slot} වේලාව දැන්ම වෙන් කරගෙන ඇත. කරුණාකර වෙනත් වේලාවක් තෝරන්න.', ta: '{slot} நேரம் இப்போதுதான் முன்பதிவு செய்யப்பட்டுவிட்டது. வேறொரு நேரத்தைத் தேர்ந்தெடுக்கவும்.' },

  /* ═══════════════ CONFLICT MODAL ═══════════════ */
  'cm.partialAvailability':  { en: 'Partial Availability',                            si: 'අර්ධ ලබාගත හැකි බව',                           ta: 'பகுதி கிடைக்கும் நிலை' },
  'cm.notFullyFreeA':        { en: 'Not fully free at',                               si: '',                                             ta: '' },
  'cm.notFullyFreeB':        { en: '',                                                si: 'වෙලාවට සම්පූර්ණයෙන් නිදහස් නොවේ',                ta: 'இல் முழுமையாக இலவசம் இல்லை' },
  'cm.closeAria':            { en: 'Close',                                           si: 'වසන්න',                                        ta: 'மூடு' },

  /* Option 1 — sequence swap */
  'cm.seqSwapWait':          { en: 'SEQUENCE SWAP — {mins}-MIN WAITING TIME ⏳',       si: 'අනුක්‍රම මාරුව — විනාඩි {mins}ක බලාසිටීම ⏳',      ta: 'வரிசை மாற்றம் — {mins} நிமிட காத்திருப்பு ⏳' },
  'cm.seqSwapZero':          { en: 'SEQUENCE SWAP — ZERO GAP ✨',                      si: 'අනුක්‍රම මාරුව — හිස් කාලය නැත ✨',                ta: 'வரிசை மாற்றம் — இடைவெளி இல்லை ✨' },
  'cm.newOrderGap':          { en: 'NEW ORDER (WITH GAP ⏳)',                          si: 'නව අනුක්‍රමය (හිස් කාලය සමඟ ⏳)',                 ta: 'புதிய வரிசை (இடைவெளியுடன் ⏳)' },
  'cm.newOrderSeamless':     { en: 'NEW ORDER (SEAMLESS ✓)',                          si: 'නව අනුක්‍රමය (බාධාවකින් තොරව ✓)',                ta: 'புதிய வரிசை (தடையின்றி ✓)' },
  'cm.reorderA':             { en: 'Reorder services — start at {slot}',              si: 'සේවා නැවත අනුක්‍රම කරන්න — {slot} වෙලාවට ආරම්භ කරන්න', ta: 'சேவைகளை மறுவரிசைப்படுத்தவும் — {slot} இல் தொடங்கவும்' },
  'cm.originalOrder':        { en: 'ORIGINAL ORDER',                                  si: 'මුල් අනුක්‍රමය',                                ta: 'அசல் வரிசை' },
  'cm.minWait':              { en: '{mins} min wait',                                 si: 'විනාඩි {mins} බලාසිටීම',                       ta: '{mins} நிமிட காத்திருப்பு' },
  'cm.why':                  { en: 'Why?',                                            si: 'ඇයි?',                                         ta: 'ஏன்?' },
  'cm.whyGap':               { en: 'You can start {svc1} at {slot}, but {prov} is busy until {time}. You will have a {mins}-minute waiting time before your {svc2} starts.',
                               si: 'ඔබට {slot} වෙලාවට {svc1} ආරම්භ කළ හැක, නමුත් {prov} {time} වනතෙක් කාර්යබහුලය. ඔබේ {svc2} ආරම්භ වීමට පෙර විනාඩි {mins}ක බලාසිටීම් කාලයක් තිබේ.',
                               ta: 'நீங்கள் {slot} இல் {svc1} ஐத் தொடங்கலாம், ஆனால் {prov} {time} வரை பிஸியாக இருப்பார். உங்கள் {svc2} தொடங்குவதற்கு முன் {mins} நிமிட காத்திருப்பு இருக்கும்.' },
  'cm.whySeamless':          { en: 'Running {svc1} first frees up the schedule so {svc2} can follow immediately — no waiting time.',
                               si: 'පළමුව {svc1} කිරීමෙන් කාලසටහන නිදහස් වන බැවින්, {svc2} වහාම අනුගමනය කළ හැක — බලාසිටීම් කාලයක් නැත.',
                               ta: 'முதலில் {svc1} செய்வதால் அட்டவணை விடுபடுகிறது, எனவே {svc2} உடனே தொடரலாம் — காத்திருப்பு இல்லை.' },
  'cm.yourFirstService':     { en: 'your first service',                              si: 'ඔබේ පළමු සේවය',                                ta: 'உங்கள் முதல் சேவை' },
  'cm.yourSecondService':    { en: 'your second service',                             si: 'ඔබේ දෙවන සේවය',                                ta: 'உங்கள் இரண்டாம் சேவை' },
  'cm.yourNextProvider':     { en: 'Your next provider',                              si: 'ඔබේ මීළඟ සේවා සැපයුම්කරු',                     ta: 'உங்கள் அடுத்த வழங்குநர்' },
  'cm.aMomentLater':         { en: 'a moment later',                                  si: 'මද වේලාවකට පසු',                               ta: 'சிறிது நேரத்திற்குப் பிறகு' },
  'cm.bookWithGap':          { en: '✓ Book with Gap ({slot})',                        si: '✓ හිස් කාලය සමඟ වෙන්කරන්න ({slot})',             ta: '✓ இடைவெளியுடன் முன்பதிவு ({slot})' },
  'cm.bookAsPrefix':         { en: '✓ Book as ',                                      si: '',                                             ta: '' },
  'cm.bookAsMid':            { en: ' at ',                                            si: ' ලෙස ',                                        ta: ' போல ' },
  'cm.bookAsSuffix':         { en: '',                                                si: ' වෙලාවට වෙන්කරන්න',                            ta: ' இல் முன்பதிவு செய்க' },

  /* Option 2 — recommended original time */
  'cm.recOriginal':          { en: 'RECOMMENDED — ORIGINAL ORDER',                    si: 'නිර්දේශිත — මුල් අනුක්‍රමය',                    ta: 'பரிந்துரை — அசல் வரிசை' },
  'cm.shiftA':               { en: 'Shift to',                                        si: '',                                             ta: '' },
  'cm.shiftB':               { en: ' — no gaps, no conflicts',                        si: ' වෙලාවට මාරු වන්න — හිස් කාල නැත, ගැටුම් නැත',    ta: ' க்கு மாறவும் — இடைவெளி இல்லை, மோதல்கள் இல்லை' },
  'cm.allFreeAt':            { en: 'All providers are fully free at {time}. Your services run back-to-back with zero waiting time.',
                               si: '{time} වෙලාවට සියලුම සේවා සැපයුම්කරුවන් සම්පූර්ණයෙන් නිදහස්ය. ඔබේ සේවාවන් කිසිදු බලාසිටීමක් නැතිව එකට පැවැත්වේ.',
                               ta: '{time} இல் எல்லா வழங்குநர்களும் முழுமையாக இலவசம். உங்கள் சேவைகள் எந்தக் காத்திருப்பும் இன்றி தொடர்ச்சியாக நடைபெறும்.' },
  'cm.bookOriginalAt':       { en: '✓ Book Original Order at {time}',                 si: '✓ මුල් අනුක්‍රමයෙන් {time} වෙලාවට වෙන්කරන්න',    ta: '✓ அசல் வரிசையில் {time} இல் முன்பதிவு செய்' },
  'cm.chooseDifferent':      { en: '← Choose a different date or time',               si: '← වෙනත් දිනයක් හෝ වේලාවක් තෝරන්න',              ta: '← வேறு தேதி அல்லது நேரத்தைத் தேர்ந்தெடுக்கவும்' },

  /* Legacy mode */
  'cm.splitOption':          { en: 'SPLIT OPTION',                                    si: 'බෙදූ විකල්පය',                                 ta: 'பிரிந்த விருப்பம்' },
  'cm.optionA':              { en: 'Option A: Split Booking (With Gap)',              si: 'විකල්පය A: බෙදූ වෙන්කිරීම (හිස් කාලය සමඟ)',      ta: 'விருப்பம் A: பிரிந்த முன்பதிவு (இடைவெளியுடன்)' },
  'cm.splitDesc':            { en: 'Start at {slot} and continue when {names} {isAre} free — {mins}-minute gap.',
                               si: '{slot} වෙලාවට ආරම්භ කර, {names} නිදහස් වූ විට ඉදිරියට යන්න — විනාඩි {mins}ක හිස් කාලය.',
                               ta: '{slot} இல் தொடங்கி, {names} இலவசமானதும் தொடரவும் — {mins} நிமிட இடைவெளி.' },
  'cm.availableAt':          { en: 'Available at {slot}',                             si: '{slot} වෙලාවට ලබාගත හැක',                      ta: '{slot} இல் கிடைக்கும்' },
  'cm.nextFreeAt':           { en: 'Next free at {slot}',                             si: 'ඊළඟට නිදහස් වන්නේ {slot} වෙලාවට',               ta: 'அடுத்து இலவசமாகும் நேரம் {slot}' },
  'cm.bookSplitVisit':       { en: 'Book as Split Visit ({slot1} & {slot2})',         si: 'බෙදූ පැමිණීමක් ලෙස වෙන්කරන්න ({slot1} සහ {slot2})', ta: 'பிரிந்த வருகையாக முன்பதிவு செய் ({slot1} & {slot2})' },
  'cm.noSplit':              { en: 'No split option available — all providers are busy at this slot.', si: 'බෙදූ විකල්පයක් නැත — මෙම වේලාවේ සියලුම සේවා සැපයුම්කරුවන් කාර්යබහුලය.', ta: 'பிரிந்த விருப்பம் இல்லை — இந்த நேரத்தில் எல்லா வழங்குநர்களும் பிஸியாக உள்ளனர்.' },
  'cm.recommended':          { en: 'RECOMMENDED',                                     si: 'නිර්දේශිත',                                    ta: 'பரிந்துரை' },
  'cm.optionB':              { en: 'Option B: Continuous / Back-to-Back Visit',       si: 'විකල්පය B: අඛණ්ඩ / එකට පැමිණීම',                 ta: 'விருப்பம் B: தொடர்ச்சியான / ஒரே முறை வருகை' },
  'cm.allInOneGo':           { en: 'All services in one go starting at {slot}. All {n} providers will be free and ready.',
                               si: 'සියලුම සේවාවන් {slot} සිට එකවර. සේවා සැපයුම්කරුවන් {n} දෙනාම නිදහස්ව සූදානම්ව සිටිනු ඇත.',
                               ta: 'அனைத்துச் சேவைகளும் {slot} முதல் ஒரே முறையில். {n} வழங்குநர்களும் இலவசமாகத் தயாராக இருப்பார்கள்.' },
  'cm.bookAllAt':            { en: '✓ Book All at {slot} (Recommended)',              si: '✓ {slot} වෙලාවට සියල්ල වෙන්කරන්න (නිර්දේශිත)',   ta: '✓ {slot} இல் அனைத்தையும் முன்பதிவு செய் (பரிந்துரை)' },
  'cm.noBackToBack':         { en: 'No back-to-back slot available for all providers today.', si: 'අද දින සියලුම සේවා සැපයුම්කරුවන් සඳහා එකට වේලාවක් නැත.', ta: 'இன்று எல்லா வழங்குநர்களுக்கும் தொடர்ச்சியான நேரம் இல்லை.' },

  'cm.gapDesc':              { en: '{names} {isAre} busy until {until}, causing a {mins}-minute gap if you start at {slot}.',
                               si: '{names} {until} වනතෙක් කාර්යබහුල බැවින්, {slot} වෙලාවට ආරම්භ කළහොත් විනාඩි {mins}ක හිස් කාලයක් ඇතිවේ.',
                               ta: '{names} {until} வரை பிஸியாக இருப்பதால், {slot} இல் தொடங்கினால் {mins} நிமிட இடைவெளி ஏற்படும்.' },

  'cm.slotsOccupied':        { en: 'TIME SLOTS THIS BOOKING WILL OCCUPY',
                               si: 'මෙම කාල පරාසයන් ඔබේ වෙන්කිරීම සඳහා වෙන් වේ',
                               ta: 'இந்த முன்பதிவு ஆக்கிரமிக்கும் நேரங்கள்' },

  'cm.gapOnlyHeader':        { en: 'AVAILABLE WITH {mins}-MIN WAITING GAP',
                               si: 'විනාඩි {mins}ක බලාසිටීමත් සමඟ ලබාගත හැක',
                               ta: '{mins} நிமிட காத்திருப்புடன் கிடைக்கும்' },

  'cm.whyGapOnly':           { en: 'You can book this time, but you will have a {mins}-minute waiting gap because {prov} is busy until {time}.',
                               si: 'ඔබට මෙම වේලාව වෙන්කරගත හැක, නමුත් {prov} {time} දක්වා කාර්යබහුල බැවින් විනාඩි {mins}ක බලාසිටීම් කාලයක් ඇතිවේ.',
                               ta: 'இந்த நேரத்தை முன்பதிவு செய்யலாம், ஆனால் {prov} {time} வரை பிஸியாக இருப்பதால் {mins} நிமிட காத்திருப்பு இருக்கும்.' },

  'cm.alternatively':        { en: 'Alternatively, you can start at {time} to keep your original order.',
                               si: 'නැත්නම්, ඔබේ මුල් අනුක්‍රමය රැකගෙන {time} වෙලාවට ආරම්භ කළ හැක.',
                               ta: 'மாறாக, உங்கள் அசல் வரிசையை வைத்திருக்க {time} இல் தொடங்கலாம்.' },
};

/* ─────────────────────────────────────────────────────────────
   SERVICE NAMES  (57 services — transliterated Sinhala)
───────────────────────────────────────────────────────────── */
const serviceNames: Record<string, { si: string; ta: string }> = {
  /* WAX */
  'Full Arms Wax':            { si: 'ෆුල් ආම්ස් වැක්ස්',                         ta: 'முழு கை வேக்ஸிங்' },
  'Full Legs Wax':            { si: 'ෆුල් ලෙග්ස් වැක්ස්',                        ta: 'முழு கால் வேக்ஸிங்' },
  'Underarm Wax':             { si: 'අන්ඩආම් වැක්ස්',                            ta: 'அக்குள் வேக்ஸிங்' },
  'Eyebrow Threading':        { si: 'අයිබ්‍රව් ත්‍රෙඩින්',                        ta: 'புருவம் சரிசெய்தல் (திரெடிங்)' },
  'Full Body Wax':            { si: 'ෆුල් බොඩි වැක්ස්',                          ta: 'முழு உடல் வேக்ஸிங்' },
  'Chest Wax':                { si: 'චෙස්ට් වැක්ස්',                             ta: 'மார்பு வேக்ஸிங்' },
  'Back Wax':                 { si: 'බැක් වැක්ස්',                               ta: 'முதுகு வேக்ஸிங்' },
  'Beard Shaping':            { si: 'බියර්ඩ් ෂේපිං',                             ta: 'தாடி வடிவமைப்பு' },
  /* HAIR */
  'Cut & Re-Style':           { si: 'කට් & රී-ස්ටයිල්',                          ta: 'வெட்டி புதிய ஸ்டைல்' },
  'Fringe Cut':               { si: 'ෆ්‍රින්ජ් කට්',                              ta: 'நெற்றி முடி வெட்டு (ஃபிரிஞ்)' },
  'Blow Dry (Short)':         { si: 'බ්ලෝ ඩ්‍රයි (ශෝට්)',                        ta: 'ப்ளோ டிரை (குறுகிய முடி)' },
  'Hair Wash & Blast Dry':    { si: 'හෙයාර් වොෂ් & බ්ලාස්ට් ඩ්‍රයි',             ta: 'முடி கழுவி உலர்த்துதல்' },
  'Trim':                     { si: 'ට්‍රිම්',                                   ta: 'ட்ரிம்' },
  'Haircut – Classic':        { si: 'හෙයාර්කට් – ක්ලාසික්',                      ta: 'கிளாசிக் முடி வெட்டு' },
  'Beard Trim':               { si: 'බියර්ඩ් ට්‍රිම්',                           ta: 'தாடி ட்ரிம்' },
  'Hair Color':               { si: 'හෙයාර් කලර්',                               ta: 'முடி நிறம்' },
  'Head Massage':             { si: 'හෙඩ් මසාජ්',                                ta: 'தலை மசாஜ்' },
  /* SKIN */
  'Classic Facial':           { si: 'ක්ලාසික් ෆේෂියල්',                          ta: 'கிளாசிக் ஃபேஷியல்' },
  'Gold Facial':              { si: 'ගෝල්ඩ් ෆේෂියල්',                            ta: 'கோல்டு ஃபேஷியல்' },
  'Skin Brightening':         { si: 'ස්කින් බ්‍රයිටනිං',                          ta: 'சரும பிரகாசம்' },
  'Acne Treatment':           { si: 'ඇක්නේ ට්‍රීට්මන්ට්',                        ta: 'முகப்பரு சிகிச்சை' },
  'Anti-Aging Facial':        { si: 'ඇන්ටි-එජිං ෆේෂියල්',                        ta: 'வயதான தோற்றத்தைக் குறைக்கும் ஃபேஷியல்' },
  'Deep Cleansing Facial':    { si: 'ඩීප් ක්ලෙන්සිං ෆේෂියල්',                    ta: 'ஆழ்ந்த சுத்தம் செய்யும் ஃபேஷியல்' },
  'Beard Care Facial':        { si: 'බියර්ඩ් කෙයාර් ෆේෂියල්',                    ta: 'தாடி பராமரிப்பு ஃபேஷியல்' },
  'Whitening Facial':         { si: 'වයිට්නිං ෆේෂියල්',                          ta: 'வெண்மையாக்கும் ஃபேஷியல்' },
  'Detox Facial':             { si: 'ඩිටොක්ස් ෆේෂියල්',                          ta: 'நச்சு நீக்கும் ஃபேஷியல்' },
  /* NAIL */
  'Classic Manicure':         { si: 'ක්ලාසික් මැනිකියර්',                        ta: 'கிளாசிக் மெனிக்கியூர்' },
  'Gel Manicure':             { si: 'ජෙල් මැනිකියර්',                            ta: 'ஜெல் மெனிக்கியூர்' },
  'Classic Pedicure':         { si: 'ක්ලාසික් පෙඩිකියර්',                        ta: 'கிளாசிக் பெடிக்கியூர்' },
  'Gel Pedicure':             { si: 'ජෙල් පෙඩිකියර්',                            ta: 'ஜெல் பெடிக்கியூர்' },
  'Nail Art (Per Set)':       { si: 'නේල් ආර්ට් (පා සෙට්)',                      ta: 'நகக் கலை (ஒரு செட்டுக்கு)' },
  'Basic Manicure':           { si: 'බේසික් මැනිකියර්',                          ta: 'அடிப்படை மெனிக்கியூர்' },
  'Basic Pedicure':           { si: 'බේසික් පෙඩිකියර්',                          ta: 'அடிப்படை பெடிக்கியூர்' },
  'Nail Trim & Buff':         { si: 'නේල් ට්‍රිම් & බෆ්',                        ta: 'நகம் வெட்டி தேய்த்தல்' },
  'Callus Removal':           { si: 'කැලස් රිමූවල්',                             ta: 'தடிமனான தோல் (காலஸ்) அகற்றல்' },
  'Hand Spa':                 { si: 'හෑන්ඩ් ස්පා',                               ta: 'கை ஸ்பா' },
  /* BODY */
  'Full Body Massage':        { si: 'ෆුල් බොඩි මසාජ්',                           ta: 'முழு உடல் மசாஜ்' },
  'Body Scrub':               { si: 'බොඩි ස්ක්‍රබ්',                             ta: 'உடல் ஸ்க்ரப்' },
  'Body Wrap':                { si: 'බොඩි රැප්',                                 ta: 'உடல் ரேப்' },
  'Aromatherapy Massage':     { si: 'ඇරෝමාතෙරපි මසාජ්',                          ta: 'அரோமாதெரபி மசாஜ்' },
  'Hot Stone Massage':        { si: 'හොට් ස්ටෝන් මසාජ්',                         ta: 'சூடான கல் மசாஜ்' },
  'Deep Tissue Massage':      { si: 'ඩීප් ටිෂූ මසාජ්',                           ta: 'ஆழ்ந்த திசு மசாஜ்' },
  'Sports Massage':           { si: 'ස්පෝට්ස් මසාජ්',                            ta: 'விளையாட்டு மசாஜ்' },
  'Back Massage':             { si: 'බැක් මසාජ්',                                ta: 'முதுகு மசாஜ்' },
  'Head & Shoulder Massage':  { si: 'හෙඩ් & ෂෝල්ඩර් මසාජ්',                     ta: 'தலை & தோள்பட்டை மசாஜ்' },
  /* BRIDAL */
  'Bridal Package – Full':    { si: 'බ්‍රයිඩල් පැකේජ් – ෆුල්',                   ta: 'மணமகள் தொகுப்பு — முழுமை' },
  'Bridal Hair & Makeup':     { si: 'බ්‍රයිඩල් හෙයාර් & මේකප්',                  ta: 'மணமகள் முடி & ஒப்பனை' },
  'Pre-Bridal Package':       { si: 'පී-බ්‍රයිඩල් පැකේජ්',                       ta: 'திருமணத்திற்கு முன் மணமகள் தொகுப்பு' },
  'Trial Makeup':             { si: 'ට්‍රයල් මේකප්',                             ta: 'சோதனை ஒப்பனை' },
  'Bridal Draping':           { si: 'බ්‍රයිඩල් ඩ්‍රේපිං',                        ta: 'மணமகள் புடவை கட்டுதல்' },
  'Groom Package':            { si: 'ග්‍රූම් පැකේජ්',                            ta: 'மணமகன் தொகுப்பு' },
  'Groom Hair & Makeup':      { si: 'ග්‍රූම් හෙයාර් & මේකප්',                    ta: 'மணமகன் முடி & ஒப்பனை' },
  'Pre-Groom Package':        { si: 'පී-ග්‍රූම් පැකේජ්',                         ta: 'திருமணத்திற்கு முன் மணமகன் தொகுப்பு' },
  'Groom Facial':             { si: 'ග්‍රූම් ෆේෂියල්',                           ta: 'மணமகன் ஃபேஷியல்' },
  'Groom Grooming':           { si: 'ග්‍රූම් ග්‍රූමිං',                          ta: 'மணமகன் குரூமிங்' },
};

/* ─────────────────────────────────────────────────────────────
   PROVIDER ROLES (lookup by English role)
───────────────────────────────────────────────────────────── */
const roleNames: Record<string, { si: string; ta: string }> = {
  'Senior Hair Stylist':    { si: 'ජ්‍යේෂ්ඨ කොණ්ඩා සැකසුම්කරු',   ta: 'மூத்த ஹேர் ஸ்டைலிஸ்ட்' },
  'Beauty Therapist':       { si: 'රූපලාවණ්‍ය චිකිත්සක',          ta: 'அழகு சிகிச்சை நிபுணர்' },
  'Nail Technician':        { si: 'නිය තාක්ෂණවේදී',             ta: 'நகத் தொழில்நுட்ப நிபுணர்' },
  'Wax Specialist':         { si: 'වැක්ස් විශේෂඥ',              ta: 'வேக்ஸ் நிபுணர்' },
  'Massage Therapist':      { si: 'සම්බාහන චිකිත්සක',            ta: 'மசாஜ் சிகிச்சை நிபுணர்' },
  'Bridal & Skin Expert':   { si: 'මනාල සහ සම් විශේෂඥ',         ta: 'மணமகள் & சரும நிபுணர்' },
  'Hair Specialist':        { si: 'කොණ්ඩා විශේෂඥ',              ta: 'முடி நிபுணர்' },
  'Skin Therapist':         { si: 'සම් චිකිත්සක',               ta: 'சரும சிகிச்சை நிபுணர்' },
  'Nail & Wax Expert':      { si: 'නිය සහ වැක්ස් විශේෂඥ',       ta: 'நகம் & வேக்ஸ் நிபுணர்' },
  'Body Therapist':         { si: 'ශරීර චිකිත්සක',              ta: 'உடல் சிகிச்சை நிபுணர்' },
  'Senior Body Therapist':  { si: 'ජ්‍යේෂ්ඨ ශරීර චිකිත්සක',       ta: 'மூத்த உடல் சிகிச்சை நிபுணர்' },
  'Bridal Specialist':      { si: 'මනාල විශේෂඥ',               ta: 'மணமகள் நிபுணர்' },
  'Nail Artist':            { si: 'නිය කලාකරු',                 ta: 'நகக் கலைஞர்' },
  'Hair Stylist':           { si: 'කොණ්ඩා සැකසුම්කරු',           ta: 'ஹேர் ஸ்டைலிஸ்ட்' },
  'Wax Therapist':          { si: 'වැක්ස් චිකිත්සක',            ta: 'வேக்ஸ் சிகிச்சை நிபுணர்' },
};

/* ─── CATEGORIES ─── */
const categoryNames: Record<string, { si: string; ta: string }> = {
  WAX:    { si: 'වැක්ස්',   ta: 'வேக்ஸ்' },
  HAIR:   { si: 'කොණ්ඩය',  ta: 'முடி' },
  SKIN:   { si: 'සම',     ta: 'சருமம்' },
  NAIL:   { si: 'නිය',    ta: 'நகம்' },
  BODY:   { si: 'ශරීරය',  ta: 'உடல்' },
  BRIDAL: { si: 'මනාල',   ta: 'மணமகள்' },
};

/* ─── LOCATIONS ─── */
const locationNames: Record<string, { si: string; ta: string }> = {
  Colombo:      { si: 'කොළඹ',       ta: 'கொழும்பு' },
  Negombo:      { si: 'මීගමුව',     ta: 'நீர்கொழும்பு' },
  Kiribathgoda: { si: 'කිරිබත්ගොඩ', ta: 'கிரிபத்கொட' },
};

/* ─── MONTH / DAY NAMES (for InlineCalendar) ─── */
const MONTHS: Record<Lang, string[]> = {
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  si: ['ජනවාරි','පෙබරවාරි','මාර්තු','අප්‍රේල්','මැයි','ජූනි','ජූලි','අගෝස්තු','සැප්තැම්බර්','ඔක්තෝබර්','නොවැම්බර්','දෙසැම්බර්'],
  ta: ['ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்','ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்'],
};
const DAYS: Record<Lang, string[]> = {
  en: ['Su','Mo','Tu','We','Th','Fr','Sa'],
  si: ['ඉරි','සඳු','අඟ','බදා','බ්‍රහ','සිකු','සෙන'],
  ta: ['ஞா','தி','செ','பு','வி','வெ','ச'],
};
/* Full weekday names (Sun → Sat) for long date strings */
const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  si: ['ඉරිදා','සඳුදා','අඟහරුවාදා','බදාදා','බ්‍රහස්පතින්දා','සිකුරාදා','සෙනසුරාදා'],
  ta: ['ஞாயிறு','திங்கள்','செவ்வாய்','புதன்','வியாழன்','வெள்ளி','சனி'],
};

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/** t('key') / t('key', { mins: 15 }) — fill {placeholders} */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = translations[key];
  let s = entry?.[lang] ?? entry?.en ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split(`{${k}}`).join(String(vars[k]));
    }
  }
  return s;
}

/** Localized service name — falls back to English if unknown */
export function svc(lang: Lang, name: string): string {
  return lang === 'en' ? name : (serviceNames[name]?.[lang] ?? name);
}
export function role(lang: Lang, name: string): string {
  return lang === 'en' ? name : (roleNames[name]?.[lang] ?? name);
}
export function cat(lang: Lang, name: string): string {
  return lang === 'en' ? name : (categoryNames[name]?.[lang] ?? name);
}
export function loc(lang: Lang, name: string): string {
  return lang === 'en' ? name : (locationNames[name]?.[lang] ?? name);
}

export function monthNames(lang: Lang): string[] { return MONTHS[lang]; }
export function dayNames(lang: Lang): string[]   { return DAYS[lang]; }
export function weekNames(lang: Lang): string[]  { return WEEKDAYS[lang]; }

/**
 * Localized long date, e.g.  "Wednesday, 26 August 2026" /
 * "2026 අගෝස්තු 26 වන බදාදා" / "26 ஆகஸ்ட் 2026, புதன்".
 * Built from OUR names — NOT toLocaleDateString('si-LK'), which renders
 * lunar month names like "නිකිණි" instead of "අගෝස්තු".
 */
export function formatDateL(lang: Lang, iso: string): string {
  const d = new Date(iso + 'T00:00');
  const wd = WEEKDAYS[lang][d.getDay()];
  const mo = MONTHS[lang][d.getMonth()];
  const day = d.getDate(), y = d.getFullYear();
  if (lang === 'si') return `${y} ${mo} ${day} වන ${wd}`;
  if (lang === 'ta') return `${day} ${mo} ${y}, ${wd}`;
  return `${wd}, ${day} ${mo} ${y}`;
}

/** "45 min" → si "විනා 45" / ta "45 நிமிட"  (for service duration labels) */
export function durStr(lang: Lang, duration: string): string {
  const m = parseInt(duration, 10) || 0;
  if (lang === 'si') return `විනා ${m}`;
  if (lang === 'ta') return `${m} நிமிட`;
  return `${m} min`;
}

/** Total duration → "1h 30min" / "පැය 1 විනා 30" / "1 மணி 30 நிமி"  (replaces fmtMins) */
export function fmtDur(lang: Lang, min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60), r = min % 60;
  if (lang === 'si') return h > 0 ? `පැය ${h}${r > 0 ? ` විනා ${r}` : ''}` : `විනා ${r}`;
  if (lang === 'ta') return h > 0 ? `${h} மணி${r > 0 ? ` ${r} நிமி` : ''}` : `${r} நிமி`;
  return h > 0 ? `${h}h${r > 0 ? ` ${r}min` : ''}` : `${r} min`;
}