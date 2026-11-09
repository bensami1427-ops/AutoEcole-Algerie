
// تخزين آمن: يعمل عبر localhost، ولا يوقف الواجهة إذا منع المتصفح التخزين المحلي
const storage=(function(){try{const s=window.localStorage;const probe='__ae_storage_test__';s.setItem(probe,'1');s.removeItem(probe);return s;}catch(e){const mem={};return {getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];}};}})();
const KEY='autoecole_v1';
/* استعادة آمنة لقاعدة البيانات: لا نسمح لبيانات محلية قديمة/ناقصة بإيقاف تحميل الواجهة */
let db, dbLoadWarning='';
try {
 const raw=storage.getItem(KEY);
 db=raw?JSON.parse(raw):{};
 if(!db || typeof db!=='object' || Array.isArray(db)) throw new Error('صيغة قاعدة البيانات غير صحيحة');
} catch(e) {
 const raw=storage.getItem(KEY);
 if(raw) { try { storage.setItem(KEY+'_recovery_backup_'+Date.now(),raw); } catch(_) {} }
 db={}; dbLoadWarning='تعذر قراءة قاعدة البيانات السابقة؛ تم الاحتفاظ بنسخة خام احتياطية إن أمكن.';
 console.error('AutoEcole database recovery:',e);
}
if(!Array.isArray(db.candidates)) {
 if(db.candidates && typeof db.candidates==='object') {
  const values=Object.values(db.candidates);
  db.candidates=values.filter(x=>x && typeof x==='object' && !Array.isArray(x));
 } else db.candidates=[];
 dbLoadWarning=dbLoadWarning||'تمت تهيئة سجل المترشحين لحماية تشغيل الواجهة.';
}
db.candidates=db.candidates.filter(c=>c && typeof c==='object' && !Array.isArray(c));
db.candidates.forEach(c=>{if(!Array.isArray(c.sessions))c.sessions=[];});
['vehicles','examBatches','examArchive','examClosedCandidates','payments','expenses'].forEach(k=>{if(!Array.isArray(db[k]))db[k]=[];});
if(!db.settings || typeof db.settings!=='object' || Array.isArray(db.settings))db.settings={};
db.candidates.forEach(c=>{if(c.examStage==='مكتمل'){c.examClosedAt ||= c.lastExamDate||'';c.examFinalStatus ||= 'ناجح في المراحل الثلاث';if(!db.examClosedCandidates.some(id=>String(id)===String(c.id)))db.examClosedCandidates.push(c.id);}});
const PRINT_POS_KEY='autoecole_print_positions_v1';let printPositions={};try{printPositions=JSON.parse(storage.getItem(PRINT_POS_KEY)||'{}')||{};}catch(e){printPositions={};}
const $=id=>document.getElementById(id);const val=id=>$(id).value;const set=(id,v)=>$(id).value=v??'';
function persist(){try{storage.setItem(KEY,JSON.stringify(db));refresh();}catch(e){alert('تعذر حفظ البيانات في المتصفح. تأكد من فتح التطبيق في Chrome والسماح بتخزين بيانات المواقع.');console.error(e);}}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function full(c){return [c.nameAr||c.nomAr||c.firstName||c.name||c.nom, c.surnameAr||c.lastName||c.surname||c.prenom].filter(Boolean).join(' ').trim() || 'اسم غير مسجل'}
// توافق مع المعرّفات القديمة: قد تكون محفوظة كأرقام في البيانات، بينما select يعيد نصاً.
function candidate(id){if(id===undefined||id===null||id==='')return undefined;return (db.candidates||[]).find(c=>String(c.id)===String(id))}
function validISODate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function latestExamDate(c){const history=Array.isArray(c.examHistory)?c.examHistory:[];const dates=history.filter(h=>String(h.result||h.status||'')!=='لم يمتحن'&&validISODate(h.date)).map(h=>h.date);if(validISODate(c.lastExamDate))dates.push(c.lastExamDate);dates.sort();return dates.length?dates[dates.length-1]:'';}
function oneYearAfterISO(iso){if(!validISODate(iso))return '';const [y,m,d]=iso.split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d));x.setUTCFullYear(x.getUTCFullYear()+1);return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`;}
function syncCandidateLifecycle(){const today=localTodayISO();db.candidates ||= [];db.examClosedCandidates ||= [];db.candidates.forEach(c=>{const finalPassed=!!(c.examClosedAt||c.examStage==='مكتمل'||c.examFinalStatus==='ناجح في المراحل الثلاث');if(finalPassed){c.lifecycleStatus='completed';c.lifecycleReason='نجاح في امتحان السياقة';c.archivedAt ||= c.examClosedAt||c.lastExamDate||today;if(!db.examClosedCandidates.some(id=>String(id)===String(c.id)))db.examClosedCandidates.push(c.id);return;}const lastExam=latestExamDate(c);const expires=lastExam?oneYearAfterISO(lastExam):'';if(expires&&today>=expires){c.lifecycleStatus='expired';c.lifecycleReason='مرور سنة على آخر امتحان اجتازه';c.lastExamDate=lastExam;c.expiredAt=expires;}else{c.lifecycleStatus='active';c.lifecycleReason='';if(lastExam)c.lastExamDate=lastExam;delete c.expiredAt;}});}
function renderCandidateArchiveRows(){const completed=$('candidateCompletedRows');if(!completed)return;const list=db.candidates.filter(c=>c.lifecycleStatus==='completed').sort((a,b)=>String(b.archivedAt||'').localeCompare(String(a.archivedAt||'')));completed.innerHTML=list.map(c=>`<tr><td>${esc(c.reg||'—')}</td><td>${esc(full(c))}</td><td>${esc(c.category||'—')}</td><td>${esc(formatOfficialDate(c.examClosedAt||c.archivedAt||''))}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد ملفات في الأرشيف النهائي حالياً.</td></tr>';}
function renderExpiredFiles(){const expired=$('candidateExpiredRows');if(!expired)return;const list=db.candidates.filter(c=>c.lifecycleStatus==='expired').sort((a,b)=>String(a.expiredAt||'').localeCompare(String(b.expiredAt||'')));expired.innerHTML=list.map(c=>`<tr><td>${esc(c.reg||'—')}</td><td>${esc(full(c))}</td><td>${esc(c.category||'—')}</td><td>${esc(formatOfficialDate(c.lastExamDate||''))}</td><td>${esc(formatOfficialDate(c.expiredAt||''))}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد ملفات منتهية الصلاحية حالياً.</td></tr>';}

function refresh(){ db.payments ||= [];db.expenses ||= [];db.examBatches ||= [];db.examArchive ||= [];db.examClosedCandidates ||= [];syncCandidateLifecycle(); $('mCandidates').textContent=db.candidates.filter(c=>c.lifecycleStatus==='active').length;let all=db.candidates.flatMap(c=>c.sessions||[]);let done=all.filter(s=>s.status==='منجزة').length;$('mDone').textContent=done;$('mRemain').textContent=all.length-done;
renderTodayLessons();
renderCandidateRows();renderCandidateArchiveRows();renderExpiredFiles();
const fp=$('formPrepCandidate');if(fp){const oldFp=fp.value;fp.innerHTML='<option value="">— اختر مترشحاً —</option>'+db.candidates.map(c=>`<option value="${c.id}">${esc(full(c))} — ${esc(c.reg)}</option>`).join('');if(candidate(oldFp))fp.value=oldFp;}
['scheduleCandidate','contractCandidate'].forEach(id=>{let old=$(id).value;$(id).innerHTML=db.candidates.map(c=>`<option value="${c.id}">${esc(full(c))} — ${esc(c.reg)}</option>`).join('');if(candidate(old))$(id).value=old;});
renderSchedule();renderContract();renderExamSelectors();renderDispatch();refreshFinance();fillFinanceCandidates();renderVehicles();renderVehicleExpiryNotice();}

function localTodayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderTodayLessons(){
 const body=$('todayLessonRows');if(!body)return;
 const today=localTodayISO();
 const dateLabel=$('todayLessonsDate');if(dateLabel){const d=new Date(today+'T12:00:00');dateLabel.textContent='التاريخ: '+d.toLocaleDateString('ar-DZ',{weekday:'long',year:'numeric',month:'long',day:'numeric'});}
 const rows=[];
 (db.candidates||[]).forEach(c=>(c.sessions||[]).forEach(s=>{
  if(s.date!==today||!s.time||s.type!=='تطبيقية'||s.status==='منجزة'||s.status==='غائبة')return;
  rows.push({time:s.time,name:full(c),status:s.status||'مبرمجة'});
 }));
 rows.sort((a,b)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name,'ar'));
 body.innerHTML=rows.length?rows.map(x=>`<tr><td><b>${esc(x.time)}</b></td><td>${esc(x.name)}</td><td>${esc(x.status)}</td></tr>`).join(''):'<tr><td colspan="3">لا توجد حصص تطبيقية مبرمجة اليوم</td></tr>';
}

function daysUntilISO(iso){if(!iso)return null;const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);if(!m)return null;const target=Date.UTC(+m[1],+m[2]-1,+m[3]);const t=localTodayISO().split('-').map(Number);const today=Date.UTC(t[0],t[1]-1,t[2]);return Math.round((target-today)/86400000);}
function expiryLabel(iso){const n=daysUntilISO(iso);if(n===null)return 'غير محدد';if(n<0)return `منتهٍ منذ ${Math.abs(n)} يوم`;if(n===0)return 'ينتهي اليوم';return `باقي ${n} يوم`}
function vehicleWarnings(){const out=[];(db.vehicles||[]).forEach(v=>{[['التأمين',v.insuranceEnd],['المراقبة التقنية',v.technicalEnd]].forEach(([kind,date])=>{const n=daysUntilISO(date);if(n!==null&&n<=5)out.push({v,kind,date,n});});});return out.sort((a,b)=>a.n-b.n);}
function renderVehicleExpiryNotice(){const box=$('vehicleExpiryNotice');if(!box)return;const list=vehicleWarnings();if(!list.length){box.innerHTML=(db.vehicles||[]).length?'<div class="vehicle-ok">✓ لا توجد تأمينات أو مراقبات تقنية تنتهي خلال الأيام الخمسة القادمة.</div>':'';return;}box.innerHTML=`<div class="vehicle-warning"><h3>⚠ تنبيهات المركبات — يرجى الانتباه</h3><p>هذه التنبيهات تظهر عند فتح لوحة القيادة، ابتداءً من خمسة أيام قبل تاريخ الانتهاء.</p><ul>${list.map(x=>`<li class="${x.n<0?'expired':'soon'}"><b>${esc(x.v.category||'مركبة')} — ${esc(x.v.reg||'دون رقم تسجيل')}</b>: ${x.kind} ${x.n<0?'منتهٍ':x.n===0?'ينتهي اليوم':`ينتهي بعد ${x.n} أيام`} (التاريخ: ${esc(x.date)})</li>`).join('')}</ul></div>`;}
function renderVehicles(){const body=$('vehicleRows');if(!body)return;body.innerHTML=(db.vehicles||[]).map(v=>{const a=daysUntilISO(v.insuranceEnd),b=daysUntilISO(v.technicalEnd);const warning=[a,b].some(n=>n!==null&&n<=5);return `<tr><td>${esc(v.category)}</td><td>${esc(v.reg)}</td><td>${esc(v.insuranceEnd||'—')}<br><small>${esc(expiryLabel(v.insuranceEnd))}</small></td><td>${esc(v.technicalEnd||'—')}<br><small>${esc(expiryLabel(v.technicalEnd))}</small></td><td>${warning?'<span class="expired">تحتاج متابعة</span>':'سارية'}</td><td class="no-print"><button class="btn gray" onclick="editVehicle('${v.id}')">تعديل</button> <button class="btn redbtn" onclick="deleteVehicle('${v.id}')">حذف</button></td></tr>`;}).join('')||'<tr><td colspan="6">لا توجد مركبات مسجلة بعد</td></tr>';}
function resetVehicleForm(){['vehicleEditId','vehicleReg','vehicleInsuranceEnd','vehicleTechnicalEnd'].forEach(id=>set(id,''));set('vehicleCategory','سيارة تعليم السياقة');$('vehicleFormTitle').textContent='إضافة مركبة جديدة';if($('vehicleAddSaveBtn'))$('vehicleAddSaveBtn').hidden=false;if($('vehicleUpdateBtn'))$('vehicleUpdateBtn').hidden=true;}
function saveVehicle(){const reg=val('vehicleReg').trim(),insuranceEnd=val('vehicleInsuranceEnd'),technicalEnd=val('vehicleTechnicalEnd');if(!reg){alert('أدخل رقم تسجيل المركبة.');$('vehicleReg').focus();return;}if(!insuranceEnd&&!technicalEnd){alert('أدخل تاريخ نهاية التأمين أو تاريخ نهاية المراقبة التقنية على الأقل.');return;}db.vehicles ||= [];const id=val('vehicleEditId')||('v'+Date.now());const item={id,category:val('vehicleCategory'),reg,insuranceEnd,technicalEnd};const i=db.vehicles.findIndex(v=>v.id===id),wasEdit=i>=0;if(wasEdit)db.vehicles[i]=item;else db.vehicles.push(item);persist();resetVehicleForm();alert(wasEdit?'تم حفظ التعديلات بنجاح.':'تم حفظ بيانات المركبة.');}
function editVehicle(id){const v=(db.vehicles||[]).find(x=>x.id===id);if(!v)return;set('vehicleEditId',v.id);set('vehicleCategory',v.category);set('vehicleReg',v.reg);set('vehicleInsuranceEnd',v.insuranceEnd);set('vehicleTechnicalEnd',v.technicalEnd);$('vehicleFormTitle').textContent='تعديل بيانات المركبة';if($('vehicleAddSaveBtn'))$('vehicleAddSaveBtn').hidden=true;if($('vehicleUpdateBtn'))$('vehicleUpdateBtn').hidden=false;show('vehicles');}
function deleteVehicle(id){if(!confirm('هل تريد حذف هذه المركبة؟'))return;db.vehicles=(db.vehicles||[]).filter(v=>v.id!==id);persist();}
function money(n){return (Number(n)||0).toLocaleString('fr-FR')+' دج'}
function fillFinanceCandidates(){
 ['payCandidate','callCandidate'].forEach(id=>{let el=$(id);if(!el)return;let old=el.value;el.innerHTML='<option value="">— اختر المترشح —</option>'+db.candidates.map(c=>`<option value="${esc(c.id)}">${esc(full(c))} — ${esc(c.reg||'')}</option>`).join('');if(old)el.value=old;});
}
function refreshFinance(){
 db.payments ||= [];db.expenses ||= [];
 let inc=db.payments.reduce((a,x)=>a+Number(x.amount||0),0),out=db.expenses.reduce((a,x)=>a+Number(x.amount||0),0);
 let debt=db.candidates.reduce((a,c)=>a+Math.max(0,36000-db.payments.filter(p=>String(p.candidateId)===String(c.id)).reduce((z,p)=>z+Number(p.amount||0),0)),0);
 if($('finIn'))$('finIn').textContent=money(inc);if($('finOut'))$('finOut').textContent=money(out);if($('finBalance'))$('finBalance').textContent=money(inc-out);if($('finDebt'))$('finDebt').textContent=money(debt);
 if($('paymentRows'))$('paymentRows').innerHTML=db.payments.length?db.payments.slice().reverse().map(p=>{let c=candidate(p.candidateId);return `<tr><td>${esc(p.date)}</td><td>${esc(c?full(c):'مترشح غير موجود في السجل')}</td><td>${esc(p.reason)}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td><td class="no-print"><button class="btn redbtn" onclick="deletePayment('${p.id}')">حذف</button></td></tr>`}).join(''):'<tr><td colspan="6">لا توجد دفعات مسجلة بعد</td></tr>';
 if($('expenseRows'))$('expenseRows').innerHTML=db.expenses.length?db.expenses.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.payee)}</td><td>${esc(x.method)}</td><td>${money(x.amount)}</td><td class="no-print"><button class="btn redbtn" onclick="deleteExpense('${x.id}')">حذف</button></td></tr>`).join(''):'<tr><td colspan="6">لا توجد مصروفات مسجلة بعد</td></tr>';
}
function addPayment(){
 let id=val('payCandidate'),amount=Number(val('payAmount'));if(!id||!candidate(id)||!Number.isFinite(amount)||amount<=0){alert('اختر مترشحًا مسجلاً وأدخل مبلغًا صحيحًا أكبر من صفر');return;}
 let p={id:'p'+Date.now(),candidateId:id,amount,date:val('payDate')||new Date().toISOString().slice(0,10),method:val('payMethod'),reason:val('payReason'),note:val('payNote')};
 db.payments.push(p);persist();$('payAmount').value='';$('payNote').value='';alert('تم تسجيل الدفعة وتحديث الحساب المالي.');printReceipt(p);
}
function printReceipt(p){
 let c=candidate(p.candidateId);let w=window.open('','_blank');if(!w){alert('اسمح بفتح النوافذ المنبثقة لطباعة الوصل');return;}
 w.document.write(`<!doctype html><html dir="rtl"><meta charset="utf-8"><title>وصل دفع</title><style>body{font-family:Tahoma;padding:20mm}h2{text-align:center}table{width:100%;border-collapse:collapse;margin-top:15mm}td{border:1px solid #555;padding:12px}.sign{margin-top:35mm;display:flex;justify-content:space-between}

/* V2.29: manual exam strike-line editor (mouse + touch) */
#examStrike{touch-action:none;pointer-events:none}
#examStrike.editing{pointer-events:auto;cursor:move;overflow:visible}
#examStrike .strike-hit{stroke:transparent;stroke-width:22;pointer-events:stroke;cursor:move}
#examStrike .strike-handle{fill:#d97706;stroke:#fff;stroke-width:2;pointer-events:all;cursor:grab}
.strike-editor{border:1px solid #d5e1ed;border-radius:12px;padding:13px;margin-top:12px;background:#f8fbff}
.strike-editor .move-controls{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.strike-editor button{min-width:42px;touch-action:manipulation}
.strike-editor .note{margin:8px 0 0}
@media(max-width:600px){.strike-editor .move-controls button{flex:1 1 42%;min-height:42px}}


/* V2.33: إعادة بناء رأس قائمة الامتحان للطباعة وفق الصورة المرجعية */
@media print {
  #exam.page.printing #examPrint .exam-official-head {
    position:relative!important;
    box-sizing:border-box!important;
    width:100%!important;
    height:46mm!important;
    min-height:46mm!important;
    margin:0 0 1.5mm!important;
    padding:0!important;
    line-height:1.2!important;
    text-align:center!important;
  }
  #exam.page.printing #examPrint .exam-official-head .agency {
    position:absolute!important; right:0!important; left:auto!important;
    top:0!important; width:48mm!important; height:28mm!important;
    box-sizing:border-box!important; padding:2mm 1mm!important;
    display:flex!important; flex-direction:column!important;
    align-items:center!important; justify-content:center!important;
    border:1px solid #111!important; border-radius:8mm!important;
    white-space:nowrap!important; font-size:12pt!important; line-height:1.35!important;
  }
  #exam.page.printing #examPrint .exam-official-head .agency #examWilayaPrint {
    font-size:12pt!important; font-weight:bold!important;
  }
  #exam.page.printing #examPrint .exam-official-head .stamp {
    position:absolute!important; left:0!important; right:auto!important;
    top:0!important; width:48mm!important; height:28mm!important;
    box-sizing:border-box!important; padding:0 1mm 2.5mm!important;
    display:flex!important; align-items:flex-end!important; justify-content:center!important;
    border:1px solid #111!important; border-radius:8mm!important;
    font-size:12pt!important; font-weight:normal!important;
  }
  #exam.page.printing #examPrint .exam-official-head .exam-national-title {
    position:absolute!important; top:1mm!important; left:49mm!important; right:49mm!important;
    display:block!important; margin:0!important; padding:0!important;
    text-align:center!important; white-space:nowrap!important;
    font-family:"Sakkal Majalla","Traditional Arabic",serif!important;
    font-size:14pt!important; font-weight:bold!important; line-height:1.2!important;
  }
  #exam.page.printing #examPrint .exam-official-head .exam-ministry-title {
    position:absolute!important; top:7mm!important; left:49mm!important; right:49mm!important;
    display:block!important; margin:0!important; padding:0!important;
    text-align:center!important; white-space:nowrap!important;
    font-family:"Sakkal Majalla","Traditional Arabic",serif!important;
    font-size:12pt!important; font-weight:bold!important; line-height:1.2!important;
  }
  #exam.page.printing #examPrint .exam-official-head .exam-title {
    position:absolute!important; top:15mm!important; left:49mm!important; right:49mm!important;
    display:block!important; width:max-content!important; max-width:calc(100% - 100mm)!important;
    margin:0 auto!important; padding:1mm 5mm!important; box-sizing:border-box!important;
    text-align:center!important; white-space:nowrap!important;
    font-family:"Sakkal Majalla","Traditional Arabic",serif!important;
    font-size:14pt!important; font-weight:bold!important; line-height:1.15!important;
    border:1px solid #111!important; border-radius:2.5mm!important;
  }
  #exam.page.printing #examPrint .exam-official-meta {
    position:absolute!important; top:30mm!important; left:0!important; right:0!important;
    width:100%!important; height:14mm!important; min-height:14mm!important;
    box-sizing:border-box!important; margin:0!important; padding:1.2mm 3mm!important;
    display:grid!important; grid-template-columns:repeat(3,minmax(0,1fr))!important;
    grid-template-rows:5mm 5mm!important; column-gap:2mm!important; row-gap:.5mm!important;
    align-items:center!important; justify-items:stretch!important;
    border:1px solid #111!important; border-radius:4mm!important;
    font-family:"Sakkal Majalla","Traditional Arabic",serif!important;
    font-size:10pt!important; line-height:1.15!important; text-align:right!important;
    white-space:nowrap!important;
  }
  #exam.page.printing #examPrint .exam-official-meta>span {
    display:block!important; min-width:0!important; white-space:nowrap!important;
    overflow:hidden!important; text-overflow:clip!important;
  }
  #exam.page.printing #examPrint .exam-official-meta>.inspector-row {
    grid-column:1 / -1!important; grid-row:2!important;
  }
}


/* V2.38: isolate the official exam sheet to exactly one A4 page and anchor strike at last name */
@media print {
  @page { size: A4 portrait; margin: 0 !important; }
  html, body { width:210mm!important; height:297mm!important; margin:0!important; padding:0!important; }
  body { overflow:hidden!important; }
  #exam.page.printing {
    display:block!important; position:relative!important; box-sizing:border-box!important;
    width:210mm!important; height:297mm!important; min-height:297mm!important; max-height:297mm!important;
    margin:0!important; padding:0!important; overflow:hidden!important;
    break-after:avoid-page!important; page-break-after:avoid!important;
  }
  #exam.page.printing > *:not(#examPrint) { display:none!important; }
  #exam.page.printing #examPrint {
    display:block!important; position:absolute!important; inset:0!important;
    box-sizing:border-box!important; width:210mm!important; height:297mm!important;
    min-height:297mm!important; max-height:297mm!important; margin:0!important;
    padding:4mm 5mm 3mm!important; overflow:hidden!important;
    break-before:avoid!important; break-after:avoid-page!important; page-break-before:avoid!important; page-break-after:avoid!important;
  }
  #exam.page.printing #examPrint .exam-table-wrap,
  #exam.page.printing #examPrint .exam-official,
  #exam.page.printing #examPrint .exam-counts { break-inside:avoid!important; page-break-inside:avoid!important; }
  #exam.page.printing #examPrint .exam-official tbody tr { height:6mm!important; min-height:6mm!important; max-height:6mm!important; }
  #exam.page.printing #examPrint #examStrike { display:block!important; position:absolute!important; inset:0 auto auto 0!important; width:100%!important; height:100%!important; }
}

/* V2.43: isolate official exam sheet on one physical A4 page and anchor strike to last populated row */
@media print {
  @page { size: A4 portrait; margin: 0 !important; }
  html, body { width:210mm!important; height:297mm!important; min-height:297mm!important; margin:0!important; padding:0!important; overflow:hidden!important; }
  body { position:relative!important; background:#fff!important; }
  body * { visibility:hidden!important; }
  #exam.page.printing, #exam.page.printing * { visibility:visible!important; }
  #exam.page.printing {
    display:block!important; position:fixed!important; left:0!important; top:0!important;
    width:210mm!important; height:297mm!important; min-height:297mm!important;
    max-height:297mm!important; margin:0!important; padding:0!important;
    overflow:hidden!important; break-after:avoid-page!important; page-break-after:avoid!important;
  }
  #exam.page.printing #examPrint {
    display:block!important; position:absolute!important; left:0!important; top:0!important;
    width:210mm!important; height:297mm!important; min-height:297mm!important;
    max-height:297mm!important; box-sizing:border-box!important;
    margin:0!important; padding:4mm 5mm 3mm!important; overflow:hidden!important;
    break-before:avoid-page!important; break-after:avoid-page!important;
    page-break-before:avoid!important; page-break-after:avoid!important;
    page-break-inside:avoid!important; break-inside:avoid!important;
  }
  #exam.page.printing #examPrint .exam-official-head { margin-bottom:2mm!important; }
  #exam.page.printing #examPrint .exam-official { width:100%!important; border-collapse:collapse!important; }
  #exam.page.printing #examPrint .exam-official tbody tr { height:5.65mm!important; }
  #exam.page.printing #examPrint .exam-official tbody td,
  #exam.page.printing #examPrint .exam-official thead th {
    height:5.65mm!important; min-height:5.65mm!important; max-height:5.65mm!important;
    box-sizing:border-box!important; padding:.35mm .4mm!important; overflow:hidden!important;
  }
  #exam.page.printing #examPrint .exam-official tbody td.person-name {
    font-family:"Times New Roman",Times,serif!important; font-size:14pt!important;
    line-height:1!important; white-space:nowrap!important;
  }
  #exam.page.printing #examPrint .exam-counts { margin-top:1.5mm!important; break-inside:avoid!important; page-break-inside:avoid!important; }
  #exam.page.printing #examPrint .exam-sign { bottom:2mm!important; }
  #exam.page.printing #examPrint .exam-table-wrap { position:relative!important; }
  #exam.page.printing #examPrint #examStrike { position:absolute!important; inset:0 auto auto 0!important; pointer-events:none!important; }
  #exam.page.printing #examPrint .no-print,
  #exam.page.printing>.panel,
  #exam.page.printing .exam-controls,
  #exam.page.printing .exam-archive { display:none!important; }
}


</style><h2>وصل استلام مبلغ</h2><p>رقم الوصل: ${esc(p.id)}</p><p>استلمت مدرسة تعليم السياقة من السيد(ة): <b>${esc(c?full(c):'')}</b></p><p>مبلغًا قدره: <b>${money(p.amount)}</b></p><p>وذلك مقابل: ${esc(p.reason)} — طريقة الدفع: ${esc(p.method)}</p><p>التاريخ: ${esc(p.date)}</p><div class="sign"><span>إمضاء المستفيد</span><span>ختم وإمضاء المدرسة</span></div><script>window.onload=()=>window.print()<\/script></html>`);w.document.close();
}
function addExpense(){
 let amount=Number(val('expenseAmount'));if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا صحيحًا أكبر من صفر');return;}
 db.expenses.push({id:'e'+Date.now(),type:val('expenseType'),amount,date:val('expenseDate')||new Date().toISOString().slice(0,10),payee:val('expensePayee'),method:val('expenseMethod'),note:val('expenseNote')});
 persist();$('expenseAmount').value='';$('expensePayee').value='';$('expenseNote').value='';alert('تم تسجيل المصروف وتحديث الرصيد.');
}
function deletePayment(id){if(confirm('حذف هذه الدفعة؟')){db.payments=db.payments.filter(x=>x.id!==id);persist();}}
function deleteExpense(id){if(confirm('حذف هذا المصروف؟')){db.expenses=db.expenses.filter(x=>x.id!==id);persist();}}
function renderCall(){
 let c=candidate(val('callCandidate'));if(!c){alert('اختر المترشح');return false;}
 $('callContent').innerHTML=`السيد(ة): <b>${esc(full(c))}</b><br>يشرفنا استدعاؤكم إلى مدرسة تعليم السياقة، وذلك من أجل: <b>${esc(val('callReason'))}</b>.<br>التاريخ: <b>${esc(val('callDate'))}</b> — الساعة: <b>${esc(val('callTime'))}</b><br>المكان: <b>${esc(val('callPlace'))}</b><br>${esc(val('callNote'))}`;return true;
}

function fields(){return ['reg','nameAr','surnameAr','nameLat','surnameLat','father','mother','birth','birthPlace','birthWilaya','gender','marital','wilaya','commune','address','nationalId','blood','nationality','phone','category','enroll','lastExamDate','remarks','guardianName','guardianSurname','guardianRelation','guardianBirth','guardianBirthPlace','guardianNationalId','guardianIdIssueDate','guardianIdIssueMunicipality','guardianPhone']}
function clearForm(){fields().forEach(k=>set(k,''));set('wilaya','مستغانم');set('nationality','جزائرية');set('category','ب');$('editId').value='';if($('candidateSaveBtn'))$('candidateSaveBtn').textContent='حفظ المترشح وإنشاء 60 حصة';$('candidateModalTitle').textContent='إضافة مترشح جديد';toggleClassBFields();candidateTab(0,document.querySelector('.candidate-tabs button'));}
function isCategoryB(c){return String(c||'').trim()==='ب'||String(c||'').trim().toUpperCase()==='B';}
function toggleClassBFields(){const yes=isCategoryB(val('category'));['birthPlaceWrap','birthWilayaWrap','genderWrap','maritalWrap','classBExtraFields'].forEach(id=>{const el=$(id);if(el)el.classList.toggle('visible',yes);});}

function dateISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function isWorkDay(d){return ![4,5].includes(d.getDay());} // الخميس والجمعة عطلة
function nextWorkDay(d){let x=new Date(d.getFullYear(),d.getMonth(),d.getDate());while(!isWorkDay(x))x.setDate(x.getDate()+1);return x;}
function buildAutomaticSessions(candidateId,startValue){
 let start=startValue?new Date(startValue+'T00:00:00'):new Date();if(Number.isNaN(start.getTime()))start=new Date();
 start=nextWorkDay(start);
 const sessions=[];let n=1,day=new Date(start);
 // النظري جماعي: حصتان يومياً في أوقات ثابتة.
 while(n<=30){if(isWorkDay(day)){for(const time of ['12:00','13:00']){if(n>30)break;sessions.push({n,type:'نظرية',date:dateISO(day),time,status:'مبرمجة',group:true});n++;}}day.setDate(day.getDate()+1);}
 // التطبيقي: حصة واحدة فقط (60 دقيقة) لكل مترشح في يوم العمل.
 const occupied=new Set();
 db.candidates.filter(c=>c.id!==candidateId).forEach(c=>(c.sessions||[]).filter(x=>x.type==='تطبيقية'&&x.date&&x.time).forEach(x=>occupied.add(x.date+' '+x.time)));
 const slots=['08:00','09:00','10:00','11:00','14:00','15:00','16:00'];
 n=1;day=new Date(start);let guard=0;
 while(n<=30&&guard<1500){if(isWorkDay(day)){const dayKey=dateISO(day);let assigned=false;for(const time of slots){const key=dayKey+' '+time;if(!occupied.has(key)){sessions.push({n,type:'تطبيقية',date:dayKey,time,status:'مبرمجة',group:false,durationMinutes:60});occupied.add(key);n++;assigned=true;break;}}}day.setDate(day.getDate()+1);guard++;}
 return sessions;
}
// ترحيل آمن للبيانات القديمة: إذا كان للمترشح أكثر من تطبيقي في اليوم، نعيد توزيع الزائد فقط.
function repairPracticalDailyLimit(){
 const all=[];db.candidates.forEach(c=>(c.sessions||[]).filter(s=>s.type==='تطبيقية'&&s.date&&s.time).forEach(s=>all.push({c,s})));
 const occupied=new Set();
 // نحتفظ بأول حصة في كل يوم لكل مترشح وبكل المواعيد غير المتعارضة.
 const keptByCandidate=new Map();
 for(const item of all){const k=item.c.id+'|'+item.s.date;const list=keptByCandidate.get(item.c.id)||new Set();if(!list.has(item.s.date)&&!occupied.has(item.s.date+' '+item.s.time)){list.add(item.s.date);keptByCandidate.set(item.c.id,list);occupied.add(item.s.date+' '+item.s.time);item.keep=true;}}
 let changed=false;
 for(const c of db.candidates){const practical=(c.sessions||[]).filter(s=>s.type==='تطبيقية'&&s.date&&s.time);const byDate=new Map();practical.forEach(s=>{let a=byDate.get(s.date)||[];a.push(s);byDate.set(s.date,a)});
  const extras=[];for(const [date,arr] of byDate){if(arr.length>1){arr.sort((a,b)=>(a.time||'').localeCompare(b.time||''));extras.push(...arr.slice(1));}}
  if(!extras.length)continue;
  changed=true;let day=new Date((practical.map(s=>s.date).sort().pop()||c.enroll||dateISO(new Date()))+'T00:00:00');day.setDate(day.getDate()+1);let guard=0;
  for(const s of extras){let placed=false;while(!placed&&guard++<1500){if(isWorkDay(day)){for(const time of ['08:00','09:00','10:00','11:00','14:00','15:00','16:00']){const key=dateISO(day)+' '+time;if(!occupied.has(key)){s.date=dateISO(day);s.time=time;s.durationMinutes=60;occupied.add(key);placed=true;break;}}}day.setDate(day.getDate()+1);} }
 }
 if(changed)storage.setItem(KEY,JSON.stringify(db));
}


function openCandidateModal(){if(!val('editId'))clearForm();const m=$('candidateModal');m.classList.add('candidate-modal-open');const editing=!!val('editId');$('candidateModalTitle').textContent=editing?'تعديل بيانات المترشح':'إضافة مترشح جديد';if($('candidateSaveBtn'))$('candidateSaveBtn').textContent=editing?'💾 حفظ التعديلات':'حفظ المترشح وإنشاء 60 حصة';candidateTab(0,document.querySelector('.candidate-tabs button'));}
function closeCandidateModal(){ $('candidateModal').classList.remove('candidate-modal-open'); }
function candidateTab(n,btn){document.querySelectorAll('#candidateModal .candidate-tab-row').forEach(r=>r.style.display=Number(r.dataset.tab)===n?'':'none');const gp=$('guardianPanel');if(gp)gp.classList.toggle('active',n===3);document.querySelectorAll('.candidate-tabs button').forEach(b=>b.classList.toggle('active',b===btn));}
function renderCandidateRows(){const body=$('candidateRows');if(!body)return;const q=String($('candidateSearch')?.value||'').trim().toLocaleLowerCase('ar');const list=db.candidates.filter(c=>c.lifecycleStatus==='active'&&(!q||[c.reg,full(c),c.nameLat,c.surnameLat].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q))));body.innerHTML=list.map(c=>{let d=(c.sessions||[]).filter(s=>s.status==='منجزة').length;return `<tr><td>${esc(c.reg||'—')}</td><td>${esc(full(c))}</td><td>${esc(c.birth||'—')}</td><td>${esc(c.category||'—')}</td><td>${d}/60</td><td><button class="btn" onclick="selectCandidate('${c.id}')">الحصص</button> <button class="btn gray" onclick="editCandidate('${c.id}')">التعديل</button></td></tr>`}).join('')||'<tr><td colspan="6">لا توجد نتائج مطابقة للبحث.</td></tr>';}
function createMinorDeclaration(){
 const id=val('editId'),c=candidate(id);
 if(!c){alert('احفظ بيانات المترشح أولاً ثم افتح ملفه لإنشاء التصريح.');return;}
 const guardian=[val('guardianName'),val('guardianSurname')].filter(Boolean).join(' ');
 if(!guardian||!val('guardianNationalId')){alert('أكمل اسم الولي ولقبه ورقم بطاقة تعريفه الوطنية أولاً.');return;}
 const escDoc=v=>String(v||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const w=window.open('','_blank');
 if(!w){alert('تعذر فتح صفحة التصريح. اسمح بالنوافذ المنبثقة لهذا البرنامج ثم أعد المحاولة.');return;}
 const relation=val('guardianRelation')||'والد';
 const relationLabel=relation==='ولي المترشح القاصر'?'ولي':relation;
 const candidateName=full(c);
 const candidateBirth=[c.birth,c.birthPlace,c.birthWilaya].filter(Boolean).join('، ');
 const guardianBirth=[val('guardianBirth'),val('guardianBirthPlace')].filter(Boolean).join('، ');
 const guardianDetails='الحامل(ة) لبطاقة التعريف الوطنية رقم '+(val('guardianNationalId')||'................')+'، الصادرة بتاريخ '+(val('guardianIdIssueDate')||'................')+' ببلدية '+(val('guardianIdIssueMunicipality')||'................');
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تصريح القاصر</title><style>
 @page{size:A4;margin:22mm 20mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:0;line-height:1.95;font-size:16px}
 h1{text-align:center;font-size:25pt;font-weight:700;margin:7mm 0 17mm}
 p{margin:0 0 10mm;text-align:justify;font-size:16px} .person-line{margin-bottom:4mm}.person-line b{font-weight:700}.address-line{display:block;margin-top:2mm}.permission{margin-top:8mm;font-weight:700;font-size:16px;text-align:right}
 .signatures{direction:ltr;display:flex;justify-content:space-between;align-items:flex-start;margin-top:24mm;min-height:35mm}
 .sign{width:43%;text-align:center;direction:rtl;font-weight:700}.sign .space{height:22mm}
 .place-date{margin-top:10mm;text-align:right;font-size:16px}
 .print-actions{margin-top:12mm;text-align:center}@media print{.print-actions{display:none}}
 </style>
<style id="v314-contract-two-page-print-fix">
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { width:210mm!important; margin:0!important; padding:0!important; background:#fff!important; }
  #contract.page.printing { display:block!important; position:static!important; width:210mm!important; height:auto!important; min-height:0!important; max-height:none!important; margin:0!important; padding:0!important; overflow:visible!important; }
  #contract.page.printing > .title, #contract.page.printing > .panel { display:none!important; }
  #contract.page.printing #contractPrint.contract-retyped { display:block!important; position:static!important; width:210mm!important; max-width:210mm!important; height:auto!important; min-height:0!important; max-height:none!important; margin:0!important; padding:0!important; overflow:visible!important; break-inside:auto!important; page-break-inside:auto!important; }
  #contract.page.printing #contractPrint.contract-retyped > .contract-page { display:block!important; position:relative!important; float:none!important; box-sizing:border-box!important; width:210mm!important; height:297mm!important; min-height:297mm!important; max-height:297mm!important; margin:0!important; padding:9mm 13mm 11mm!important; overflow:hidden!important; break-inside:avoid!important; page-break-inside:avoid!important; box-shadow:none!important; }
  #contract.page.printing #contractPrint.contract-retyped > .contract-page-one { break-after:page!important; page-break-after:always!important; }
  #contract.page.printing #contractPrint.contract-retyped > .contract-page-two { break-before:auto!important; break-after:auto!important; page-break-before:auto!important; page-break-after:auto!important; }
  #contract.page.printing #contractPrint.contract-retyped .contract-edit-tools { display:none!important; }
}
</style>
</head><body>
 <h1>تصريح القاصر</h1>
 <p class="person-line">أنا الممضي أسفله، السيد (ة): <b>${escDoc(guardian)}</b>${guardianBirth?'، المولود(ة) بتاريخ ومكان: <b>'+escDoc(guardianBirth)+'</b>':''}.</p>
 <p>${escDoc(guardianDetails)}.</p>
 <p class="person-line">${escDoc(relationLabel)} المترشح القاصر: <b>${escDoc(candidateName)}</b>${candidateBirth?'، المولود بتاريخ ومكان: <b>'+escDoc(candidateBirth)+'</b>':''}.${c.address?'<span class="address-line">العنوان: <b>'+escDoc(c.address)+'</b></span>':''}</p>
 <p class="permission">أسمح لابني بالمشاركة في امتحان رخصة السياقة.</p>
 <div class="signatures"><div class="sign">مصادقة البلدية<div class="space"></div></div><div class="sign">إمضاء الولي<div class="space"></div></div></div>
 <div class="place-date">حرر بـ: ........................................<br>بتاريخ: ........ / ........ / ................</div>
 <div class="print-actions"><button onclick="window.print()">طباعة التصريح</button></div>
 <style id="v314-contract-two-page-print-fix">
/* Contract print: remove stray top-level text and keep the official document on two A4 pages. */
.contract-retyped .contract-page-one .contract-top{
  display:block!important;position:relative!important;box-sizing:border-box!important;
  width:100%!important;min-height:34mm!important;height:auto!important;
  margin:0 0 1.5mm!important;padding:0!important;overflow:visible!important;text-align:center!important;
}
.contract-retyped .contract-page-one .contract-top .contract-republic{
  display:block!important;position:absolute!important;top:0!important;left:0!important;right:auto!important;
  width:130mm!important;min-width:130mm!important;max-width:130mm!important;
  margin:0!important;padding:0!important;text-align:center!important;white-space:nowrap!important;
  font-size:16pt!important;line-height:1.3!important;
}
.contract-retyped .contract-page-one .contract-top .contract-school{
  display:block!important;position:absolute!important;top:0!important;right:0!important;left:auto!important;
  width:39mm!important;min-width:39mm!important;max-width:39mm!important;
  margin:0!important;padding:0!important;text-align:center!important;font-size:9pt!important;line-height:1.3!important;
}
.contract-retyped .contract-page-one .contract-top>h1{
  display:block!important;position:relative!important;width:100%!important;
  margin:18mm 0 1mm!important;padding:0!important;text-align:center!important;
  font-size:18pt!important;line-height:1.15!important;
}
.contract-retyped .contract-page-one .contract-top>.contract-legal-ref{
  display:block!important;width:100%!important;max-width:165mm!important;
  margin:0 auto!important;padding:0 2mm!important;text-align:center!important;
  white-space:normal!important;line-height:1.2!important;font-size:7.5pt!important;
}
.contract-retyped .contract-grid{
  display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
  column-gap:4mm!important;row-gap:.7mm!important;align-items:stretch!important;
  margin:0 0 .7mm!important;padding:0!important;
}
.contract-retyped .contract-grid>div{
  box-sizing:border-box!important;position:relative!important;display:flex!important;
  flex-flow:row nowrap!important;align-items:baseline!important;gap:1mm!important;
  min-width:0!important;min-height:5mm!important;height:auto!important;
  margin:0!important;padding:0 .4mm .7mm!important;overflow:hidden!important;
  white-space:nowrap!important;line-height:1.12!important;
}
.contract-retyped .contract-grid>div.wide{grid-column:1/-1!important}
.contract-retyped .contract-grid b{flex:0 0 auto!important;white-space:nowrap!important;line-height:1.12!important}
.contract-retyped .contract-grid span{
  display:inline-block!important;flex:1 1 auto!important;min-width:0!important;
  margin:0!important;padding:0!important;white-space:nowrap!important;
  overflow:hidden!important;overflow-wrap:normal!important;line-height:1.12!important;
}
.contract-retyped .contract-grid.owner-details-grid .owner-address-location-row,
.contract-retyped .contract-grid.owner-details-grid .owner-contact-row{
  display:flex!important;flex-flow:row nowrap!important;align-items:baseline!important;
  gap:2mm!important;min-width:0!important;white-space:nowrap!important;
}
.contract-retyped .contract-grid.owner-details-grid .owner-address-location-row>div,
.contract-retyped .contract-grid.owner-details-grid .owner-contact-row>div{
  display:flex!important;flex:1 1 0!important;align-items:baseline!important;
  gap:.7mm!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;
}
.contract-retyped .contract-grid.owner-details-grid .owner-address-location-row>div:first-child{flex:1.8 1 0!important}
.contract-retyped .contract-grid.owner-details-grid .owner-address-location-row>div span,
.contract-retyped .contract-grid.owner-details-grid .owner-contact-row>div span{
  flex:1 1 auto!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;
}
.contract-retyped .contract-grid.candidate-identity-grid{
  grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,2.15fr)!important;
  column-gap:3mm!important;
}
.contract-retyped .contract-grid.candidate-identity-grid .candidate-birth-combined{white-space:nowrap!important}
.contract-retyped .contract-page-one{font-size:9.1pt!important;line-height:1.12!important}
.contract-retyped .contract-page-two{font-size:8.9pt!important;line-height:1.12!important}
.contract-retyped .contract-page p{margin:.4mm 0!important;line-height:1.15!important}
.contract-retyped .contract-page h3{font-size:10pt!important;margin:.8mm 0 .3mm!important;line-height:1.12!important}
.contract-retyped .contract-page-two ul{margin:.25mm 0!important;padding-right:6mm!important}
.contract-retyped .contract-page-two li{margin:.12mm 0!important;line-height:1.12!important}
@media print{
 @page{size:A4 portrait;margin:0}
 html,body{width:210mm!important;margin:0!important;padding:0!important;background:#fff!important}
 main{padding:0!important;max-width:none!important;margin:0!important}
 .layout{display:block!important;margin:0!important;padding:0!important}
 #contract.page.printing{display:block!important;position:static!important;width:210mm!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;overflow:visible!important}
 #contract.page.printing>.title,#contract.page.printing>.panel{display:none!important}
 #contract.page.printing #contractPrint.contract-retyped{display:block!important;position:static!important;width:210mm!important;max-width:210mm!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;overflow:visible!important;break-inside:auto!important;page-break-inside:auto!important}
 #contract.page.printing #contractPrint.contract-retyped>.contract-page{display:block!important;position:relative!important;float:none!important;box-sizing:border-box!important;width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:9mm 13mm 11mm!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;box-shadow:none!important}
 #contract.page.printing #contractPrint.contract-retyped>.contract-page-one{break-after:page!important;page-break-after:always!important}
 #contract.page.printing #contractPrint.contract-retyped>.contract-page-two{break-before:auto!important;break-after:auto!important;page-break-before:auto!important;page-break-after:auto!important}
 #contract.page.printing #contractPrint.contract-retyped .contract-edit-tools{display:none!important}
 #contract.page.printing #contractPrint.contract-retyped .contract-page-no{bottom:10mm!important}
}
</style>

<script id="v338-nationalid-phone-format">
(function(){
  function digitsOnly(value){ return String(value||'').replace(/\D/g,''); }
  function formatPhone(value){
    var digits=digitsOnly(value).slice(0,10);
    return digits.match(/.{1,2}/g)?.join(' ') || '';
  }
  document.addEventListener('input',function(event){
    var el=event.target;
    if(!el || el.tagName!=='INPUT') return;
    if(el.id==='nationalId'){
      var clean=digitsOnly(el.value).slice(0,18);
      if(el.value!==clean) el.value=clean;
      return;
    }
    if(el.type==='tel' || /phone|tel/i.test(el.id||'')){
      var formatted=formatPhone(el.value);
      if(el.value!==formatted) el.value=formatted;
    }
  });
  document.addEventListener('DOMContentLoaded',function(){
    var nin=document.getElementById('nationalId');
    if(nin){ nin.setAttribute('maxlength','18'); nin.setAttribute('inputmode','numeric'); }
    document.querySelectorAll('input[type="tel"],input[id*="Phone"],input[id*="phone"],input[id*="Tel"],input[id*="tel"],input[id="setTechMobile"],input[id="setTechLandline"]').forEach(function(el){
      el.setAttribute('inputmode','tel');
      el.setAttribute('placeholder',el.getAttribute('placeholder')||'05 12 34 56 78');
      if(el.value) el.value=formatPhone(el.value);
    });
  });
})();
<\\/script>


<style id="technical-card-a4-full-page-v346">
/* V346: use the full printable A4 height while keeping the complete card on one page. */
@media print{
  #technicalCardPrintPage.active{height:283mm!important;min-height:283mm!important;overflow:hidden!important}
  #technicalCardPrint{height:283mm!important;min-height:283mm!important;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;gap:0!important}
  #technicalCardPrint .tc-head{font-size:11.5pt!important;line-height:1.42!important;margin:0 0 2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-title{font-size:20pt!important;line-height:1.32!important;margin:1.5mm 0 2mm!important;padding:2.2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-fields{flex:1 1 auto!important;min-height:0!important;grid-template-columns:1fr 1fr!important;grid-auto-rows:minmax(7.5mm,auto)!important;align-content:space-evenly!important;gap:1.5mm 5mm!important;font-size:11.2pt!important;line-height:1.38!important;margin:1mm 0 2mm!important}
  #technicalCardPrint .tc-line{min-height:7.5mm!important;padding:1mm 1.2mm!important;line-height:1.35!important}
  #technicalCardPrint h3{font-size:13.5pt!important;line-height:1.32!important;margin:2mm 0 0!important;padding:2mm!important;flex:0 0 auto!important}
  #technicalCardPrint table{font-size:10pt!important;margin:0 0 1.5mm!important;flex:0 0 auto!important}
  #technicalCardPrint th,#technicalCardPrint td{height:9mm!important;min-height:9mm!important;padding:1.1mm!important;line-height:1.28!important}
  #technicalCardPrint .tc-human-table thead tr:first-child th{height:10mm!important}
  #technicalCardPrint .tc-human-table thead tr:nth-child(2) th{height:6mm!important;padding:.5mm!important}
}
</style>

</body></html>`);
 w.document.close();w.focus();
}
function createGuardianAffidavit(){alert('زر التصريح الشرفي جاهز. أرسل لي محتوى التصريح عندما يكون جاهزاً لأربطه ببيانات الولي والمترشح وأجعله قابلاً للطباعة.');}

function findDuplicateCandidateField(field,value,excludeId){
 const normalized=String(value||'').trim().replace(/\s+/g,'').toLocaleLowerCase();
 if(!normalized)return null;
 return (db.candidates||[]).find(item=>String(item.id)!==String(excludeId||'')&&String(item[field]||'').trim().replace(/\s+/g,'').toLocaleLowerCase()===normalized)||null;
}
/* V365 phone handling: shared formatter for every phone field in the app. */
function normalizePhoneDigits(value){
 let raw=String(value??'').replace(/[٠-٩۰-۹]/g,ch=>{
  const a='٠١٢٣٤٥٦٧٨٩',p='۰۱۲۳۴۵۶۷۸۹';const ai=a.indexOf(ch);return String(ai>=0?ai:p.indexOf(ch));
 }).replace(/\D/g,'');
 if(raw.startsWith('00213')&&raw.length===14)raw='0'+raw.slice(5);
 else if(raw.startsWith('213')&&raw.length===12)raw='0'+raw.slice(3);
 return raw;
}
function formatAlgerianPhone(value,fieldId){
 const d=normalizePhoneDigits(value).slice(0,10);
 if(d.length===9||(/landline/i.test(String(fieldId||''))&&d.length<=9)){if(d.length<=3)return d;return [d.slice(0,3),d.slice(3,5),d.slice(5,7),d.slice(7,9)].filter(Boolean).join(' ');}
 if(d.length<=4)return d;
 return [d.slice(0,4),d.slice(4,6),d.slice(6,8),d.slice(8,10)].filter(Boolean).join(' ');
}
function isValidAlgerianPhone(value){const d=normalizePhoneDigits(value);return d.length===10&&/^0[567]/.test(d);}
function isValidAlgerianContact(value){const d=normalizePhoneDigits(value);return isValidAlgerianPhone(value)||(d.length===9&&/^0[234]/.test(d));}
function isPhoneInput(el){return !!el&&el.tagName==='INPUT'&&(el.type==='tel'||el.hasAttribute('data-phone')||/^(phone|guardianPhone|legalRepPhoneInput|setPhone|setTechMobile|setTechLandline)$/i.test(el.id)||/(phone|tel)/i.test(el.id||''));}
function phoneDigitCountBefore(value,position){return normalizePhoneDigits(String(value||'').slice(0,Math.max(0,position||0))).length;}
function phoneCaretForDigitCount(value,count){if(count<=0)return 0;let seen=0;for(let i=0;i<value.length;i++){if(/[0-9]/.test(value[i])&&++seen>=count)return i+1;}return value.length;}
function formatPhoneInput(el){
 if(!isPhoneInput(el))return;
 const old=el.value,caret=typeof el.selectionStart==='number'?el.selectionStart:old.length;
 const digitsBefore=phoneDigitCountBefore(old,caret),formatted=formatAlgerianPhone(old,el.id);
 if(old!==formatted){el.value=formatted;const next=phoneCaretForDigitCount(formatted,digitsBefore);try{el.setSelectionRange(next,next);}catch(_){}}
 el.setAttribute('inputmode','numeric');el.setAttribute('autocomplete','tel');el.setAttribute('dir','ltr');el.style.textAlign='left';el.maxLength=16;
}
function setupPhoneInputs(){
 document.querySelectorAll('input[type="tel"],input[data-phone],input[id="phone"],input[id$="Phone"],input[id*="Phone"],input[id*="phone"],input[id*="Tel"],input[id*="tel"],input[id="setTechMobile"],input[id="setTechLandline"]').forEach(el=>{
  if(!isPhoneInput(el))return;el.setAttribute('inputmode','numeric');el.setAttribute('autocomplete','tel');el.setAttribute('dir','ltr');el.setAttribute('maxlength','16');
  if(!el.placeholder)el.placeholder='05 55 53 43 07';formatPhoneInput(el);
 });
}
document.addEventListener('input',function(event){if(isPhoneInput(event.target))formatPhoneInput(event.target);},true);
document.addEventListener('change',function(event){if(isPhoneInput(event.target))formatPhoneInput(event.target);},true);
document.addEventListener('blur',function(event){
 const el=event.target;if(!isPhoneInput(el))return;
 const mobile=/^(phone|guardianPhone|legalRepPhoneInput|setPhone|setTechMobile)$/i.test(el.id||'');
 if(mobile&&el.value&&!isValidAlgerianPhone(el.value))el.setCustomValidity('رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ05 أو06 أو07');
 else el.setCustomValidity('');
},true);
function normalizeStoredPhoneData(){
 let changed=false;const fmt=(v,id)=>formatAlgerianPhone(v||'',id);
 (db.candidates||[]).forEach(c=>['phone','guardianPhone','legalRepPhone'].forEach(k=>{if(c[k]){const n=fmt(c[k]);if(n!==c[k]){c[k]=n;changed=true;}}}));
 db.settings||={};[['phone','setPhone'],['techMobile','setTechMobile'],['techLandline','setTechLandline']].forEach(([k,id])=>{if(db.settings[k]){const n=fmt(db.settings[k],id);if(n!==db.settings[k]){db.settings[k]=n;changed=true;}}});
 (db.examBatches||[]).forEach(b=>(b.candidateSnapshots||[]).forEach(c=>{if(c.phone){const n=fmt(c.phone);if(n!==c.phone){c.phone=n;changed=true;}}}));
 if(changed){try{storage.setItem(KEY,JSON.stringify(db));}catch(e){console.warn('Phone normalization could not be persisted:',e);}}
 return changed;
}

function saveCandidate(){
 const id=val('editId')||('c'+Date.now());
 const nationalId=val('nationalId').replace(/\D/g,'').trim(),reg=val('reg').trim();
 if(!/^\d{18}$/.test(nationalId)){
  alert('رقم التعريف الوطني يجب أن يتكون من 18 رقمًا بالضبط. يرجى إدخال الرقم الصحيح.');
  $('nationalId').focus();return;
 }
 const duplicateNin=findDuplicateCandidateField('nationalId',nationalId,id);
 if(duplicateNin){alert('رقم التعريف الوطني مسجل مسبقاً باسم: '+full(duplicateNin)+'؛ يرجى التحقق من الرقم.');$('nationalId').focus();return;}
 const duplicateReg=findDuplicateCandidateField('reg',reg,id);
 if(duplicateReg){alert('رقم تسجيل الملف مسجل مسبقاً باسم: '+full(duplicateReg)+'؛ يرجى التحقق من الرقم.');$('reg').focus();return;}
 let old=candidate(id);let c=old?{...old,id}:{id};
 fields().forEach(k=>c[k]=val(k));
 c.phone=formatAlgerianPhone(c.phone);c.guardianPhone=formatAlgerianPhone(c.guardianPhone);
 if(c.phone&&!isValidAlgerianPhone(c.phone)){alert('رقم هاتف المترشح غير صحيح. أدخل 10 أرقام تبدأ بـ05 أو06 أو07.');$('phone').focus();return;}
 if(c.guardianPhone&&!isValidAlgerianPhone(c.guardianPhone)){alert('رقم هاتف الولي غير صحيح. أدخل 10 أرقام تبدأ بـ05 أو06 أو07.');$('guardianPhone').focus();return;}
 if(!isCategoryB(c.category)){c.gender='';c.birthPlace='';c.birthWilaya='';c.marital='';}
 if(old){c.sessions=old.sessions||buildAutomaticSessions(id,c.enroll);db.candidates=db.candidates.map(x=>x.id===id?c:x);}
 else{c.sessions=buildAutomaticSessions(id,c.enroll);db.candidates.push(c);}
 persist();clearForm();closeCandidateModal();
 alert(old?'تم تحديث بيانات المترشح.':'تم حفظ المترشح وبرمجة 30 حصة نظرية و30 حصة تطبيقية تلقائياً حسب رزنامة العمل.');
}
function editCandidate(id){let c=candidate(id);fields().forEach(k=>set(k,/phone/i.test(k)?formatAlgerianPhone(c[k]):c[k]));set('editId',id);toggleClassBFields();show('candidates');openCandidateModal();}
function openCandidateFormPrep(){const id=val('editId');const c=candidate(id);if(!c){alert('احفظ بيانات المترشح أولاً، ثم افتح تعديل ملفه لاستخدام تجهيز الاستمارة.');return;}closeCandidateModal();set('formPrepCandidate',c.id);renderCandidateFormData(c);show('formPrep');}
function openCandidateContract(){const id=val('editId');const c=candidate(id);if(!c){alert('احفظ بيانات المترشح أولاً، ثم افتح تعديل ملفه لاستخدام عقد التعليم.');return;}closeCandidateModal();set('contractCandidate',c.id);renderContract();show('contract');}
function deleteCandidate(id){if(confirm('هل تريد حذف المترشح وكل حصصه؟')){db.candidates=db.candidates.filter(c=>c.id!==id);persist()}}
function selectCandidate(id){$('scheduleCandidate').value=id;show('schedule');renderSchedule()}

const THEORY_CURRICULUM=[
['الفصل 1 — إشارات وقواعد حركة المرور','الإشارات العمودية: لوحات الخطر والمنع ونهاية المنع','تمييز اللوحات وفهم دلالاتها ومسافات تطبيقها.'],
['الفصل 1 — إشارات وقواعد حركة المرور','الإشارات العمودية: الإلزام والإرشاد والتوجيه والأولوية','قراءة لوحات الإلزام والإرشاد وتحديد الأولوية.'],
['الفصل 1 — إشارات وقواعد حركة المرور','اللويحات والأعمدة والأحجار الكيلومترية والإشارات الضوئية','فهم اللوحات المكملة والإشارات الضوئية.'],
['الفصل 1 — إشارات وقواعد حركة المرور','أعوان تنظيم حركة المرور','ترتيب تعليمات الأعوان مع الإشارات الضوئية واللوحات.'],
['الفصل 1 — إشارات وقواعد حركة المرور','الإشارات الأفقية: الخطوط وعلامات الطريق','قراءة الخطوط المتصلة والمتقطعة والعلامات الأرضية.'],
['الفصل 1 — إشارات وقواعد حركة المرور','أسهم التوجيه والمسالك الخاصة والعلامات الأخرى','اختيار المسلك الصحيح واحترام المسالك المخصصة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','الإشارات المؤقتة العمودية والأفقية','التصرف في مناطق الأشغال والتحويلات المؤقتة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','القواعد الإدارية للمركبات والسائقين','الوثائق والالتزامات الإدارية للسائق والمركبة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','التموضع والتلاقي','التموضع الصحيح والتلاقي الآمن في الطرق الضيقة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','التجاوز وأسبقية المرور','شروط التجاوز وقواعد الأولوية في الحالات المختلفة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','السرعة والحمولة ومجموعة المركبات','ملاءمة السرعة واحترام الحمولة وشروط نقلها.'],
['الفصل 1 — إشارات وقواعد حركة المرور','السياقة ليلاً وفي سوء الأحوال الجوية','الرؤية والإنارة والمسافات ومخاطر الطقس.'],
['الفصل 1 — إشارات وقواعد حركة المرور','الوقوف والتوقف','أماكن وشروط الوقوف والتوقف والحالات الممنوعة.'],
['الفصل 1 — إشارات وقواعد حركة المرور','مخالفات قواعد المرور والجنح والعقوبات','التعرف على المخالفات والجنح وآثارها القانونية.'],
['الفصل 2 — مفاهيم عامة حول المركبة','أصناف المحركات ومكونات المحرك ومبدأ عمله','مبادئ عمل المحرك ومكوناته الأساسية.'],
['الفصل 2 — مفاهيم عامة حول المركبة','نظام نقل الحركة وعلبة السرعات','وظيفة علبة السرعات وعناصر نقل الحركة.'],
['الفصل 2 — مفاهيم عامة حول المركبة','نظام التعليق وإطارات العجلات','وظيفة التعليق وحالة الإطارات وتأثيرها على الثبات.'],
['الفصل 2 — مفاهيم عامة حول المركبة','نظام الفرملة وأنواع المكابح','مكونات الفرامل ومبدأ عملها والعوامل المؤثرة سلباً فيها.'],
['الفصل 2 — مفاهيم عامة حول المركبة','المؤشرات الضوئية وأضواء المركبة','معاني مؤشرات لوحة القيادة والأضواء الأمامية والخلفية.'],
['الفصل 3 — السياقة الآمنة وأخلاقيات السائق','العوامل المؤدية إلى سياقة غير آمنة','التعب والتشتت والانفعال والسرعة والسلوكيات الخطرة.'],
['الفصل 3 — السياقة الآمنة وأخلاقيات السائق','الاحتياطات لتفادي حوادث المرور','استباق الخطر وترك مسافة الأمان واحترام مستعملي الطريق.'],
['الفصل 3 — السياقة الآمنة وأخلاقيات السائق','أخلاقيات السائق والمسؤولية','التسامح واحترام الراجلين والفئات الهشة والسلوك المسؤول.'],
['الفصل 4 — الإسعافات الأولية والحوادث','التصرف عند وقوع حادث عرضي','تأمين المكان وتقييم الوضع وطلب المساعدة.'],
['الفصل 4 — الإسعافات الأولية والحوادث','التصرف عند وقوع حادث مرور مادي','حماية المكان وتبادل المعلومات والإجراءات المناسبة.'],
['الفصل 4 — الإسعافات الأولية والحوادث','التصرف عند وقوع حادث مرور جسماني','تنبيه الإسعاف وعدم تعريض المصابين لمخاطر إضافية.'],
['الفصل 5 — السياقة الاقتصادية والتكنولوجيات الحديثة','مبادئ السياقة الاقتصادية','التسارع المنتظم وتوقع حركة المرور وتقليل الاستهلاك.'],
['الفصل 5 — السياقة الاقتصادية والتكنولوجيات الحديثة','الصيانة والقيادة ذات الأثر البيئي','العلاقة بين حالة المركبة والاستهلاك والانبعاثات.'],
['الفصل 5 — السياقة الاقتصادية والتكنولوجيات الحديثة','التكنولوجيات الحديثة المساعدة على السياقة','أنظمة المساعدة والتنبيه وحدود الاعتماد عليها.'],
['مراجعة وتطبيق','تحليل وضعيات مرورية مركبة','دمج الإشارات والأولوية والتموضع والسرعة في حالات واقعية.'],
['مراجعة وتقييم','مراجعة شاملة واختبار تحضيري','قياس الاستيعاب النظري وتحديد المحاور التي تحتاج إلى دعم.']
];
const PRACTICE_CURRICULUM=[
['الفصل 1 — مدخل إلى سياقة السيارات','التعرف على المركبة وأجهزتها','تحديد الأجهزة الأساسية ووظائفها قبل استعمال المركبة.'],
['الفصل 1 — مدخل إلى سياقة السيارات','طريقة الصعود والنزول من المركبة','الصعود والنزول الآمن والتحقق من المحيط.'],
['الفصل 1 — مدخل إلى سياقة السيارات','تجهيزات المركبة وملحقات السلامة','التعرف على أحزمة الأمان والمرايا ومعدات السلامة.'],
['الفصل 1 — مدخل إلى سياقة السيارات','الحمولة وأعمال المراقبة الاعتيادية','توزيع الحمولة وفحوصات ما قبل الانطلاق.'],
['الفصل 1 — مدخل إلى سياقة السيارات','الصيانة والمراقبة الدورية الأساسية','مراقبة الإطارات والأضواء والسوائل والتنبيه للأعطال.'],
['الفصل 1 — مدخل إلى سياقة السيارات','معرفة شبكة الطرقات','التعرف على أنواع الطرق والبيئة المرورية.'],
['الفصل 1 — مدخل إلى سياقة السيارات','التعامل مع إشارات المرور واحترامها','التعرف العملي على الإشارات والاستجابة الصحيحة.'],
['الفصل 1 — مدخل إلى سياقة السيارات','التصرف في الظروف المناخية الصعبة','تكييف السرعة والرؤية ومسافة الأمان مع الطقس.'],
['الفصل 1 — مدخل إلى سياقة السيارات','التصرف عند العوائق','الملاحظة المبكرة واختيار التصرف الآمن حول العوائق.'],
['الفصل 2 — التدرب على التحكم في السياقة','الجلوس على مقعد القيادة وضبط المرايا','ضبط المقعد والمقود والمرايا وحزام الأمان.'],
['الفصل 2 — التدرب على التحكم في السياقة','تشغيل المحرك والتعرف على أجهزة القيادة','تشغيل آمن وفهم المؤشرات الأساسية.'],
['الفصل 2 — التدرب على التحكم في السياقة','الانطلاق والتوقف الأولي','تنسيق الدواسات والمقود والانطلاق والتوقف بسلاسة.'],
['الفصل 2 — التدرب على التحكم في السياقة','التحكم في وتيرة السرعة','تثبيت السرعة وتخفيضها وفق ظروف الطريق.'],
['الفصل 2 — التدرب على التحكم في السياقة','التحكم في المسار والمقود','السير المستقيم والمحافظة على المسلك.'],
['الفصل 2 — التدرب على التحكم في السياقة','إدراك المحيط الطرقي والملاحظة','المراقبة البصرية واستعمال المرايا والنظر الاستباقي.'],
['الفصل 2 — التدرب على التحكم في السياقة','معرفة مسافة الأمان','تقدير مسافة التوقف وترك مسافة مناسبة.'],
['الفصل 2 — التدرب على التحكم في السياقة','التعامل مع التقاطعات','الاقتراب والتموضع والتحقق من الأولوية والعبور.'],
['الفصل 2 — التدرب على التحكم في السياقة','التعامل مع الملتقيات الدائرية','اختيار المسلك والدخول والدوران والخروج بأمان.'],
['الفصل 2 — التدرب على التحكم في السياقة','التلاقي والتجاوز وتغيير المسلك','المراقبة والإشارة والتحقق من السلامة قبل المناورة.'],
['الفصل 2 — التدرب على التحكم في السياقة','السياقة داخل التجمعات السكانية','التعامل مع الراجلين والمركبات والتوقفات المتكررة.'],
['الفصل 2 — التدرب على التحكم في السياقة','السياقة خارج التجمعات السكانية','التكيف مع السرعات الأعلى والمنعرجات ومجال الرؤية.'],
['الفصل 2 — التدرب على التحكم في السياقة','السياقة في مختلف الأوضاع','تطبيق مهارات التحكم في أوضاع مرورية متنوعة.'],
['الفصل 2 — التدرب على التحكم في السياقة','السياقة ليلاً وضعف الرؤية','استعمال الأضواء وتكييف السرعة ومسافة الأمان.'],
['الفصل 2 — التدرب على التحكم في السياقة','السياقة في المطر والظروف الصعبة','تجنب الانزلاق والتعامل مع انخفاض التماسك.'],
['الفصل 2 — التدرب على التحكم في السياقة','الوقوف والتوقف الآمن','اختيار المكان والإشارة والتموضع والتوقف.'],
['الفصل 2 — التدرب على التحكم في السياقة','الركن على التوازي','تقدير المساحة والمناورة والمراقبة المستمرة.'],
['الفصل 2 — التدرب على التحكم في السياقة','الركن العمودي والرجوع إلى الخلف','التحكم البطيء واستعمال المرايا والنقاط المرجعية.'],
['الفصل 2 — التدرب على التحكم في السياقة','المناورة في مساحة ضيقة وتغيير الاتجاه','التحكم في أبعاد المركبة والمحيط القريب.'],
['الفصل 2 — التدرب على التحكم في السياقة','مسار متكامل داخل وخارج المدينة','دمج الانطلاق والتموضع والأولوية والتقاطعات والوقوف.'],
['الفصل 2 — التدرب على التحكم في السياقة','تقييم تطبيقي شامل ومعالجة النقائص','تقييم الاستقلالية والسلامة وتحديد المهارات الواجب تحسينها.']
];

// V331 — Practical workshop with traffic lights and directional route arrows. Drawings are stored with the candidate and session.
let workshopCtx=null,workshopBase=null,workshopUndoStack=[],workshopPointer=null,workshopDirty=false;
// 3D reference scenes; the original vector scenarios remain as fallback for scenes not yet illustrated.
const workshopSceneImages={};
[['intersection','assets/intersection_3d.jpg'],['roundabout','assets/roundabout_3d.jpg']].forEach(([key,src])=>{const im=new Image();im.onload=()=>{if(val('workshopScene')===key)drawWorkshopScene();};im.src=src;workshopSceneImages[key]=im;});
function workshopCandidateChanged(){const c=candidate(val('workshopCandidate'));const sel=$('workshopSession');if(!sel)return;sel.innerHTML='<option value="">اختر الحصة التطبيقية</option>'+(c?(c.sessions||[]).map((x,i)=>x.type==='تطبيقية'?`<option value="${i}">الحصة ${i+1} — ${esc(x.date||'غير محدد')} — ${esc(x.time||'')}</option>`:'').join(''):'');$('workshopSavedList').innerHTML='<p class="note">اختر الحصة لعرض الشروحات المحفوظة.</p>';}

let workshopViewerRestore=null;
function openWorkshopViewer(){
 const panel=document.querySelector('.practical-workshop'),toolbar=panel?.querySelector('.workshop-toolbar'),wrap=panel?.querySelector('.workshop-canvas-wrap');
 if(!panel||!toolbar||!wrap)return;
 let overlay=document.getElementById('workshopViewerOverlay');
 if(!overlay){overlay=document.createElement('div');overlay.id='workshopViewerOverlay';overlay.className='workshop-viewer-overlay';overlay.innerHTML='<div class="workshop-viewer-head"><strong>عرض الوضعية التدريبية — أدوات الرسم متاحة</strong><button type="button" onclick="closeWorkshopViewer()">✕ إغلاق والعودة</button></div><div id="workshopViewerToolbarHost"></div><div id="workshopViewerCanvasHost"></div>';document.body.appendChild(overlay);}
 if(!workshopViewerRestore){workshopViewerRestore={toolbarParent:toolbar.parentNode,toolbarNext:toolbar.nextSibling,wrapParent:wrap.parentNode,wrapNext:wrap.nextSibling};}
 overlay.querySelector('#workshopViewerToolbarHost').appendChild(toolbar);overlay.querySelector('#workshopViewerCanvasHost').appendChild(wrap);
 overlay.classList.add('active');document.body.classList.add('workshop-viewer-open');
 const viewTool=$('workshopTool');if(viewTool)viewTool.value='pen';
}
function closeWorkshopViewer(){const overlay=document.getElementById('workshopViewerOverlay');if(!overlay||!workshopViewerRestore)return;const {toolbarParent,toolbarNext,wrapParent,wrapNext}=workshopViewerRestore;const toolbar=overlay.querySelector('.workshop-toolbar'),wrap=overlay.querySelector('.workshop-canvas-wrap');if(toolbarParent)toolbarParent.insertBefore(toolbar,toolbarNext);if(wrapParent)wrapParent.insertBefore(wrap,wrapNext);overlay.classList.remove('active');document.body.classList.remove('workshop-viewer-open');workshopViewerRestore=null;}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('workshopViewerOverlay')?.classList.contains('active'))closeWorkshopViewer();});

async function toggleWorkshopFullscreen(){const panel=document.querySelector('.practical-workshop');if(!panel)return;try{if(document.fullscreenElement){await document.exitFullscreen();}else if(panel.requestFullscreen){await panel.requestFullscreen();}else{panel.classList.toggle('workshop-fullscreen-fallback');}}catch(e){$('workshopStatus').textContent='تعذر فتح ملء الشاشة في هذا المتصفح.';}const b=document.querySelector('.workshop-fullscreen-btn');if(b)b.textContent=document.fullscreenElement?'⤢ خروج من ملء الشاشة':'⛶ ملء الشاشة';}
document.addEventListener('fullscreenchange',()=>{const b=document.querySelector('.workshop-fullscreen-btn');if(b)b.textContent=document.fullscreenElement?'⤢ خروج من ملء الشاشة':'⛶ ملء الشاشة';});
function workshopCtxInit(){const canvas=$('workshopCanvas');if(!canvas||canvas.dataset.ready)return;workshopCtx=canvas.getContext('2d');canvas.dataset.ready='1';canvas.addEventListener('pointerdown',workshopStart);canvas.addEventListener('pointermove',workshopMove);canvas.addEventListener('pointerup',workshopEnd);canvas.addEventListener('pointercancel',workshopEnd);canvas.addEventListener('pointerleave',e=>{if(workshopPointer)workshopEnd(e)});drawWorkshopScene();}
function workshopSaveUndo(){const c=$('workshopCanvas');if(!c||!workshopCtx)return;workshopUndoStack.push(workshopCtx.getImageData(0,0,c.width,c.height));if(workshopUndoStack.length>25)workshopUndoStack.shift();}
function workshopRoad(ctx,x,y,w,h){ctx.fillStyle='#555d63';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f7f4d8';ctx.lineWidth=5;ctx.setLineDash([24,18]);ctx.beginPath();if(w>h){ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2)}else{ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h)}ctx.stroke();ctx.setLineDash([]);}
function workshopCar(ctx,x,y,angle=0,color='#d8e7f2'){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.strokeStyle='#253746';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-34,-17,68,34,8);ctx.fill();ctx.stroke();ctx.fillStyle='#6e9bb4';ctx.fillRect(-13,-13,26,26);ctx.restore();}
function workshopSignal(ctx,x,y,active='red',scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle='#263238';ctx.strokeStyle='#111827';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(-20,-12,40,112,10);ctx.fill();ctx.stroke();[['red','#ef4444'],['yellow','#facc15'],['green','#22c55e']].forEach(([k,col],i)=>{ctx.beginPath();ctx.fillStyle=k===active?col:'#475569';ctx.arc(0,8+i*36,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#0f172a';ctx.stroke();});ctx.fillStyle='#263238';ctx.fillRect(-5,100,10,30);ctx.restore();}
function workshopDirectionArrow(ctx,x,y,angle=0,color='#fff',scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-42,0);ctx.lineTo(34,0);ctx.stroke();ctx.beginPath();ctx.moveTo(48,0);ctx.lineTo(18,-22);ctx.lineTo(18,22);ctx.closePath();ctx.fill();ctx.restore();}
function workshopRouteArrow(ctx,a,b,color='#16a34a',width=12){const ang=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-30*Math.cos(ang-.55),b.y-30*Math.sin(ang-.55));ctx.lineTo(b.x-30*Math.cos(ang+.55),b.y-30*Math.sin(ang+.55));ctx.closePath();ctx.fill();ctx.restore();}
function drawWorkshopScene(){const canvas=$('workshopCanvas');if(!canvas)return;workshopCtx=canvas.getContext('2d');const c=workshopCtx,w=canvas.width,h=canvas.height,scene=val('workshopScene')||'intersection';c.clearRect(0,0,w,h);const photo=workshopSceneImages[scene],has3D=!!(photo&&photo.complete&&photo.naturalWidth);if(has3D){c.drawImage(photo,0,0,w,h);}else{c.fillStyle='#dce8dc';c.fillRect(0,0,w,h);c.fillStyle='#a8c69b';for(let x=35;x<w;x+=95)for(let y=35;y<h;y+=95){c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();}
if(scene==='intersection'){workshopRoad(c,0,285,w,190);workshopRoad(c,500,0,200,h);c.fillStyle='#fff';c.font='24px Arial';c.fillText('قف / STOP',730,265);workshopCar(c,600,630,-Math.PI/2,'#d7e9f5');workshopCar(c,210,380,0,'#f1d2a9');c.fillStyle='#f8e8a0';c.fillRect(515,270,170,220);}
if(scene==='roundabout'){c.fillStyle='#555d63';c.beginPath();c.arc(600,380,235,0,Math.PI*2);c.arc(600,380,125,0,Math.PI*2,true);c.fill('evenodd');c.fillStyle='#8dbb83';c.beginPath();c.arc(600,380,116,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.font='25px Arial';c.fillText('الأولوية داخل الملتقى',450,390);workshopRoad(c,0,320,390,120);workshopRoad(c,810,320,390,120);workshopRoad(c,540,0,120,145);workshopRoad(c,540,615,120,145);workshopCar(c,255,380,0,'#f1d2a9');}
if(scene==='uturn'){workshopRoad(c,0,230,w,300);c.strokeStyle='#f7f4d8';c.lineWidth=5;c.setLineDash([25,18]);c.beginPath();c.moveTo(0,380);c.lineTo(w,380);c.stroke();c.setLineDash([]);workshopCar(c,330,300,0,'#f1d2a9');c.fillStyle='#fff';c.font='25px Arial';c.fillText('محور دوران آمن مع مراقبة الاتجاهين',350,195);}
if(scene==='parallel'||scene==='reverse'){workshopRoad(c,0,270,w,300);c.fillStyle='#b9c4c8';c.fillRect(0,210,w,60);c.fillStyle='#fff';c.font='22px Arial';c.fillText('الرصيف',35,248);for(let x=440;x<=760;x+=170)workshopCar(c,x,345,0,'#aab8c4');workshopCar(c,600,490,scene==='parallel'?0:-Math.PI/2,'#f1d2a9');c.strokeStyle='#fff';c.lineWidth=4;c.setLineDash([12,10]);c.strokeRect(440,390,320,105);c.setLineDash([]);}
if(scene==='merge'){workshopRoad(c,0,245,w,300);c.fillStyle='#555d63';c.beginPath();c.moveTo(0,650);c.lineTo(450,545);c.lineTo(450,475);c.lineTo(0,545);c.closePath();c.fill();c.strokeStyle='#f7f4d8';c.lineWidth=5;c.setLineDash([22,16]);c.beginPath();c.moveTo(0,600);c.lineTo(450,510);c.stroke();c.setLineDash([]);workshopCar(c,260,565,-.2,'#f1d2a9');workshopCar(c,850,385,0,'#c7e1f2');}}
// اتجاهات المسارات وإشارات المرور الأساسية لكل وضعية.
if(!has3D&&scene==='intersection'){workshopDirectionArrow(c,270,380,0);workshopDirectionArrow(c,600,150,Math.PI/2);workshopDirectionArrow(c,930,380,Math.PI);workshopDirectionArrow(c,600,610,-Math.PI/2);workshopSignal(c,745,170,'red',.78);workshopSignal(c,430,495,'green',.68);}
if(!has3D&&scene==='roundabout'){workshopDirectionArrow(c,365,380,0,'#facc15',.8);workshopDirectionArrow(c,600,145,Math.PI/2,'#facc15',.8);workshopDirectionArrow(c,830,380,Math.PI,'#facc15',.8);workshopSignal(c,300,250,'green',.62);}
if(!has3D&&scene==='uturn'){workshopDirectionArrow(c,180,310,0);workshopDirectionArrow(c,1010,445,Math.PI);workshopSignal(c,1050,160,'yellow',.62);}
if(!has3D&&(scene==='parallel'||scene==='reverse')){workshopDirectionArrow(c,260,410,0);workshopDirectionArrow(c,940,410,Math.PI);workshopSignal(c,1040,165,'green',.58);}
if(!has3D&&scene==='merge'){workshopDirectionArrow(c,760,360,0);workshopDirectionArrow(c,180,585,-.2,'#facc15',.8);workshopSignal(c,1040,165,'green',.58);}
c.fillStyle='#1f2937';c.font='bold 26px Tahoma';c.fillText(({intersection:'تقاطع بأربع اتجاهات',roundabout:'ملتقى دوراني',uturn:'محور دوران',parallel:'الركن الموازي',reverse:'الركن الخلفي',merge:'الاندماج وتغيير المسار'})[scene],28,45);workshopBase=c.getImageData(0,0,w,h);workshopUndoStack=[];workshopDirty=false;renderWorkshopSavedList();}
function workshopPoint(e){const r=$('workshopCanvas').getBoundingClientRect();return {x:(e.clientX-r.left)*1200/r.width,y:(e.clientY-r.top)*760/r.height};}
function workshopStart(e){if(e.button!==undefined&&e.button!==0)return;const canvas=$('workshopCanvas');const tool=val('workshopTool');if(tool==='view'){openWorkshopViewer();return;}canvas.setPointerCapture?.(e.pointerId);workshopSaveUndo();const p=workshopPoint(e);const c=workshopCtx;if(tool==='signal'){workshopSignal(c,p.x,p.y,val('workshopLightState')||'red',.9);workshopDirty=true;workshopPointer=null;return;}workshopPointer={start:p,last:p};c.beginPath();c.moveTo(p.x,p.y);if(tool==='pen'||tool==='route'){c.strokeStyle=val('workshopColor');c.lineWidth=Number(val('workshopWidth'));c.lineCap='round';c.lineJoin='round';}else if(tool==='eraser'){workshopEraseAt(p);}}
function workshopEraseAt(p){const c=$('workshopCanvas');if(!c||!workshopBase)return;const r=24,x=Math.max(0,Math.floor(p.x-r)),y=Math.max(0,Math.floor(p.y-r)),w=Math.min(c.width-x,r*2),h=Math.min(c.height-y,r*2);if(w>0&&h>0)workshopCtx.putImageData(workshopBase,0,0,x,y,w,h);}
function workshopMove(e){if(!workshopPointer)return;const p=workshopPoint(e),c=workshopCtx,tool=val('workshopTool');if(tool==='eraser'){workshopEraseAt(p);workshopPointer.last=p;}else if(tool==='pen'||tool==='route'){c.lineTo(p.x,p.y);c.stroke();workshopPointer.last=p;}else{restoreWorkshopLast();c.strokeStyle=tool==='route'?'#16a34a':val('workshopColor');c.lineWidth=Number(val('workshopWidth'));c.setLineDash([]);c.beginPath();if(tool==='line')c.moveTo(workshopPointer.start.x,workshopPointer.start.y),c.lineTo(p.x,p.y);else if(tool==='arrow'){const a=workshopPointer.start,b=p,ang=Math.atan2(b.y-a.y,b.x-a.x),head=25;c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.moveTo(b.x,b.y);c.lineTo(b.x-head*Math.cos(ang-.5),b.y-head*Math.sin(ang-.5));c.moveTo(b.x,b.y);c.lineTo(b.x-head*Math.cos(ang+.5),b.y-head*Math.sin(ang+.5));}else if(tool==='rect')c.rect(workshopPointer.start.x,workshopPointer.start.y,p.x-workshopPointer.start.x,p.y-workshopPointer.start.y);else if(tool==='circle'){const rx=(p.x-workshopPointer.start.x)/2,ry=(p.y-workshopPointer.start.y)/2;c.ellipse(workshopPointer.start.x+rx,workshopPointer.start.y+ry,Math.abs(rx),Math.abs(ry),0,0,Math.PI*2);}c.stroke();}}
function restoreWorkshopLast(){const snap=workshopUndoStack[workshopUndoStack.length-1];if(snap)workshopCtx.putImageData(snap,0,0);}
function workshopEnd(){if(!workshopPointer)return;const p=workshopPointer.last||workshopPointer.start;if(!['pen','eraser','route'].includes(val('workshopTool'))){const c=workshopCtx,tool=val('workshopTool');c.strokeStyle=val('workshopColor');c.lineWidth=Number(val('workshopWidth'));c.beginPath();if(tool==='line'){c.moveTo(workshopPointer.start.x,workshopPointer.start.y);c.lineTo(p.x,p.y)}else if(tool==='arrow'){const a=workshopPointer.start,b=p,ang=Math.atan2(b.y-a.y,b.x-a.x),head=25;c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.moveTo(b.x,b.y);c.lineTo(b.x-head*Math.cos(ang-.5),b.y-head*Math.sin(ang-.5));c.moveTo(b.x,b.y);c.lineTo(b.x-head*Math.cos(ang+.5),b.y-head*Math.sin(ang+.5));}else if(tool==='rect')c.rect(workshopPointer.start.x,workshopPointer.start.y,p.x-workshopPointer.start.x,p.y-workshopPointer.start.y);else if(tool==='circle'){const rx=(p.x-workshopPointer.start.x)/2,ry=(p.y-workshopPointer.start.y)/2;c.ellipse(workshopPointer.start.x+rx,workshopPointer.start.y+ry,Math.abs(rx),Math.abs(ry),0,0,Math.PI*2)}c.stroke();}else if(val('workshopTool')==='route'){const a=workshopPointer.start,b=p;workshopRouteArrow(c,a,b,'#16a34a',Math.max(8,Number(val('workshopWidth'))));}workshopPointer=null;workshopDirty=true;}
function undoWorkshop(){const snap=workshopUndoStack.pop();if(snap)workshopCtx.putImageData(snap,0,0);}
function clearWorkshopDrawing(){if(!confirm('هل تريد مسح جميع الرسومات الحالية؟'))return;drawWorkshopScene();$('workshopNotes').value='';}
function workshopKey(){return {c:candidate(val('workshopCandidate')),i:val('workshopSession'),scene:val('workshopScene')};}
function saveWorkshopDrawing(){const {c,i,scene}=workshopKey();if(!c||i===''){alert('اختر المترشح والحصة التطبيقية أولاً.');return;}c.workshopDrawings||={};const id=String(i)+'_'+scene;const entry={scene,image:$('workshopCanvas').toDataURL('image/png'),notes:val('workshopNotes'),date:new Date().toISOString(),sessionIndex:Number(i)};c.workshopDrawings[id]=entry;persist();workshopDirty=false;renderWorkshopSavedList();$('workshopStatus').textContent='تم حفظ الشرح وربطه بالمترشح والحصة التطبيقية.';}
function renderWorkshopSavedList(){const {c,i}=workshopKey(),box=$('workshopSavedList');if(!box)return;const items=Object.entries(c?.workshopDrawings||{}).filter(([k,v])=>i!==''&&v.sessionIndex===Number(i));box.innerHTML=items.map(([k,v])=>`<div class="workshop-saved-item"><img src="${v.image}" alt="شرح مروري محفوظ"><b>${esc(({intersection:'تقاطع',roundabout:'ملتقى دوراني',uturn:'محور دوران',parallel:'ركن موازٍ',reverse:'ركن خلفي',merge:'اندماج'})[v.scene]||v.scene)}</b><p class="note">${esc(v.notes||'بدون ملاحظات')}</p><button class="btn gray" onclick="openSavedWorkshop('${esc(c.id)}','${esc(k)}')">عرض الشرح</button> <button class="btn" onclick="printSavedWorkshop('${esc(c.id)}','${esc(k)}')">طباعة</button></div>`).join('')||'<p class="note">لا توجد شروحات محفوظة لهذه الحصة بعد.</p>';}
function openSavedWorkshop(cid,key){const c=candidate(cid),v=c?.workshopDrawings?.[key];if(!v)return;$('workshopScene').value=v.scene;const img=new Image();img.onload=()=>{workshopCtx.clearRect(0,0,1200,760);workshopCtx.drawImage(img,0,0)};img.src=v.image;$('workshopNotes').value=v.notes||'';$('workshopStatus').textContent='تم فتح الشرح المحفوظ.';}
function printWorkshopDrawing(){const {c,i}=workshopKey();if(!c||i===''){alert('اختر المترشح والحصة أولاً.');return;}const img=$('workshopCanvas').toDataURL('image/png');const w=window.open('','_blank');if(!w){alert('يرجى السماح بالنوافذ المنبثقة للطباعة.');return;}w.document.write(`<html dir="rtl"><head><title>شرح تطبيقي</title><style>body{font-family:Tahoma;text-align:center;padding:15px}img{width:100%;max-width:1000px}p{line-height:1.8}</style></head><body><h2>شرح الحصة التطبيقية — ${esc(full(c))}</h2><p>الحصة رقم ${Number(i)+1} — ${esc(c.sessions[i]?.date||'')}</p><img src="${img}"><p>${esc(val('workshopNotes'))}</p><script>window.onload=()=>window.print()<\/script>
<style id="technical-card-a4-full-page-v346">
/* V346: use the full printable A4 height while keeping the complete card on one page. */
@media print{
  #technicalCardPrintPage.active{height:283mm!important;min-height:283mm!important;overflow:hidden!important}
  #technicalCardPrint{height:283mm!important;min-height:283mm!important;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;gap:0!important}
  #technicalCardPrint .tc-head{font-size:11.5pt!important;line-height:1.42!important;margin:0 0 2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-title{font-size:20pt!important;line-height:1.32!important;margin:1.5mm 0 2mm!important;padding:2.2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-fields{flex:1 1 auto!important;min-height:0!important;grid-template-columns:1fr 1fr!important;grid-auto-rows:minmax(7.5mm,auto)!important;align-content:space-evenly!important;gap:1.5mm 5mm!important;font-size:11.2pt!important;line-height:1.38!important;margin:1mm 0 2mm!important}
  #technicalCardPrint .tc-line{min-height:7.5mm!important;padding:1mm 1.2mm!important;line-height:1.35!important}
  #technicalCardPrint h3{font-size:13.5pt!important;line-height:1.32!important;margin:2mm 0 0!important;padding:2mm!important;flex:0 0 auto!important}
  #technicalCardPrint table{font-size:10pt!important;margin:0 0 1.5mm!important;flex:0 0 auto!important}
  #technicalCardPrint th,#technicalCardPrint td{height:9mm!important;min-height:9mm!important;padding:1.1mm!important;line-height:1.28!important}
  #technicalCardPrint .tc-human-table thead tr:first-child th{height:10mm!important}
  #technicalCardPrint .tc-human-table thead tr:nth-child(2) th{height:6mm!important;padding:.5mm!important}
}
</style>

</body></html>`);w.document.close();}
function printSavedWorkshop(cid,key){const c=candidate(cid),v=c?.workshopDrawings?.[key];if(!v)return;const w=window.open('','_blank');if(!w)return;w.document.write(`<html dir="rtl"><head><title>شرح محفوظ</title><style>body{font-family:Tahoma;text-align:center;padding:15px}img{width:100%;max-width:1000px}p{line-height:1.8}</style></head><body><h2>شرح تطبيقي — ${esc(full(c))}</h2><img src="${v.image}"><p>${esc(v.notes||'')}</p><script>window.onload=()=>window.print()<\/script>
<style id="technical-card-a4-full-page-v346">
/* V346: use the full printable A4 height while keeping the complete card on one page. */
@media print{
  #technicalCardPrintPage.active{height:283mm!important;min-height:283mm!important;overflow:hidden!important}
  #technicalCardPrint{height:283mm!important;min-height:283mm!important;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;gap:0!important}
  #technicalCardPrint .tc-head{font-size:11.5pt!important;line-height:1.42!important;margin:0 0 2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-title{font-size:20pt!important;line-height:1.32!important;margin:1.5mm 0 2mm!important;padding:2.2mm!important;flex:0 0 auto!important}
  #technicalCardPrint .tc-fields{flex:1 1 auto!important;min-height:0!important;grid-template-columns:1fr 1fr!important;grid-auto-rows:minmax(7.5mm,auto)!important;align-content:space-evenly!important;gap:1.5mm 5mm!important;font-size:11.2pt!important;line-height:1.38!important;margin:1mm 0 2mm!important}
  #technicalCardPrint .tc-line{min-height:7.5mm!important;padding:1mm 1.2mm!important;line-height:1.35!important}
  #technicalCardPrint h3{font-size:13.5pt!important;line-height:1.32!important;margin:2mm 0 0!important;padding:2mm!important;flex:0 0 auto!important}
  #technicalCardPrint table{font-size:10pt!important;margin:0 0 1.5mm!important;flex:0 0 auto!important}
  #technicalCardPrint th,#technicalCardPrint td{height:9mm!important;min-height:9mm!important;padding:1.1mm!important;line-height:1.28!important}
  #technicalCardPrint .tc-human-table thead tr:first-child th{height:10mm!important}
  #technicalCardPrint .tc-human-table thead tr:nth-child(2) th{height:6mm!important;padding:.5mm!important}
}
</style>

</body></html>`);w.document.close();}

function switchTrainingTab(name){['schedule','progress','workshop','curriculum'].forEach(k=>{const panel=$(`${k}TabPanel`);if(panel)panel.hidden=k!==name;const btn=document.querySelector(`[data-training-tab="${k}"]`);if(btn)btn.classList.toggle('active',k===name);});if(name==='progress')renderPracticalEvaluation();if(name==='workshop'){workshopCtxInit();const main=$('scheduleCandidate')?.value||'';if($('workshopCandidate')&&!$('workshopCandidate').options.length){$('workshopCandidate').innerHTML=$('scheduleCandidate')?.innerHTML||'';$('workshopCandidate').value=main;workshopCandidateChanged();}else if($('workshopCandidate')&&main&&$('workshopCandidate').value!==main){$('workshopCandidate').value=main;workshopCandidateChanged();}}if(name==='curriculum')renderCurriculum('theory');}
function renderCurriculum(kind='theory'){const data=kind==='practice'?PRACTICE_CURRICULUM:THEORY_CURRICULUM;document.querySelectorAll('[data-curriculum-kind]').forEach(b=>b.classList.toggle('active',b.dataset.curriculumKind===kind));const list=$('curriculumLessonList');if(!list)return;list.innerHTML=data.map((x,i)=>`<article class="curriculum-lesson"><header><h4>الحصة ${String(i+1).padStart(2,'0')} — ${kind==='theory'?'نظرية':'تطبيقية'}</h4><small>${esc(x[0])}</small></header><p><b>${esc(x[1])}</b></p><p>${esc(x[2])}</p></article>`).join('');}
function renderSchedule(){let c=candidate(val('scheduleCandidate'));if(!c){$('scheduleRows').innerHTML='';$('scheduleTitle').textContent='';renderPracticalEvaluation();return}let type=val('scheduleType');$('scheduleTitle').textContent=`المترشح: ${full(c)} — رقم الملف: ${c.reg}`;let rows=c.sessions.filter(s=>type==='all'||s.type===type);let counters={'نظرية':0,'تطبيقية':0};$('scheduleRows').innerHTML=rows.map((s,i)=>{let idx=c.sessions.indexOf(s);let displayNo=++counters[s.type];return `<tr class="${rows.length>30&&i===29?'schedule-page-break':''}"><td>${displayNo}</td><td>${s.type}</td><td>${esc(s.date)}</td><td>${esc(s.time)}</td><td>${esc(s.status)}</td><td class="no-print"><input type="date" value="${s.date}" onchange="updateSession('${c.id}',${idx},'date',this.value)"><input type="time" value="${s.time}" onchange="updateSession('${c.id}',${idx},'time',this.value)"><select onchange="updateSession('${c.id}',${idx},'status',this.value)"><option ${s.status==='غير مبرمجة'?'selected':''}>غير مبرمجة</option><option ${s.status==='مبرمجة'?'selected':''}>مبرمجة</option><option ${s.status==='منجزة'?'selected':''}>منجزة</option><option ${s.status==='غائبة'?'selected':''}>غائبة</option></select>${s.type==='تطبيقية'?`<button class="btn bluebtn" type="button" onclick="openPracticalEvaluation(${idx})">تقييم الحصة</button>`:''}</td></tr>`}).join('');renderPracticalEvaluation();}
const PRACTICAL_SKILLS=['التعرف على المركبة وضبط المقعد والمرايا','الانطلاق والتوقف','التحكم في المقود والمسار','تغيير السرعات والتحكم في الدواسات','استعمال الإشارات والمرايا','احترام الأولوية وعلامات المرور','التعامل مع التقاطعات والمنعرجات','الركن والمناورات','السياقة في حركة المرور'];
const PRACTICAL_LEVELS=['ممتاز','جيد','متوسط','ضعيف','لم يتعلم بعد'];
const OFFICIAL_LEVELS=['مبتدئ','متوسط','متحكم'];
const OFFICIAL_CHAPTERS=[{type:'theory',n:1,title:'النظري — الفصل 1: إشارات وقواعد حركة المرور'},{type:'theory',n:2,title:'النظري — الفصل 2: مفاهيم عامة حول المركبة'},{type:'theory',n:3,title:'النظري — الفصل 3: السياقة الآمنة وأخلاقيات السائق'},{type:'theory',n:4,title:'النظري — الفصل 4: الإسعافات الأولية والحوادث'},{type:'theory',n:5,title:'النظري — الفصل 5: السياقة الاقتصادية والتكنولوجيات الحديثة'},{type:'practice',n:1,title:'التطبيقي — الفصل 1: مدخل إلى سياقة السيارات'},{type:'practice',n:2,title:'التطبيقي — الفصل 2: التدرب على التحكم في السياقة'}];
function renderOfficialChapterLevels(c){const box=$('officialChapterLevels');if(!box)return;const saved=c?.officialProgress||{};box.innerHTML=OFFICIAL_CHAPTERS.map(x=>{const id=`official_${x.type}_${x.n}`;return `<div class="evaluation-skill"><label for="${id}">${x.title}</label><select id="${id}"><option value="">لم يقيّم بعد</option>${OFFICIAL_LEVELS.map(v=>`<option ${saved[x.type]?.[x.n-1]===v?'selected':''}>${v}</option>`).join('')}</select></div>`}).join('');}
function saveOfficialChapterLevels(){const c=candidate(val('scheduleCandidate'));if(!c){alert('اختر المترشح أولاً.');return;}c.officialProgress={theory:OFFICIAL_CHAPTERS.filter(x=>x.type==='theory').map(x=>val(`official_${x.type}_${x.n}`)),practice:OFFICIAL_CHAPTERS.filter(x=>x.type==='practice').map(x=>val(`official_${x.type}_${x.n}`)),updatedAt:new Date().toISOString()};persist();$('officialProgressStatus').textContent='تم حفظ مستويات التحصيل الرسمية للمترشح.';}
function renderPracticalEvaluation(){const c=candidate(val('scheduleCandidate'));renderOfficialChapterLevels(c);const sel=$('evaluationSession');if(!sel)return;const previous=sel.value;sel.innerHTML='<option value="">اختر حصة تطبيقية</option>'+(c?(c.sessions||[]).map((x,i)=>x.type==='تطبيقية'?`<option value="${i}">الحصة ${i+1} — ${esc(x.date)} — ${esc(x.time)}</option>`:'').join(''):'');if(previous&&sel.querySelector(`option[value="${previous}"]`))sel.value=previous;const skills=$('evaluationSkills');if(skills&&!skills.dataset.ready){skills.innerHTML=PRACTICAL_SKILLS.map((x,i)=>`<div class="evaluation-skill"><label for="evalSkill${i}">${x}</label><select id="evalSkill${i}" onchange="updateEvaluationOverall()"><option value="">لم يتم تقييمها</option>${PRACTICAL_LEVELS.map(v=>`<option>${v}</option>`).join('')}</select></div>`).join('');skills.dataset.ready='1';}renderEvaluationHistory(c);}
function openPracticalEvaluation(index){const sel=$('evaluationSession');if(sel){sel.value=String(index);loadPracticalEvaluation();$('practicalEvaluationPanel').scrollIntoView({behavior:'smooth',block:'start'});}}
function loadPracticalEvaluation(){const c=candidate(val('scheduleCandidate')),i=Number(val('evaluationSession'));const e=c?.practicalEvaluations?.[i];PRACTICAL_SKILLS.forEach((_,n)=>{const el=$(`evalSkill${n}`);if(el)el.value=e?.skills?.[n]||'';});$('evaluationDate').value=e?.date||c?.sessions?.[i]?.date||new Date().toISOString().slice(0,10);$('evaluationNotes').value=e?.notes||'';$('evaluationNextFocus').value=e?.nextFocus||'';updateEvaluationOverall();}
function updateEvaluationOverall(){const vals=PRACTICAL_SKILLS.map((_,i)=>val(`evalSkill${i}`)).filter(Boolean);const rank={'ممتاز':5,'جيد':4,'متوسط':3,'ضعيف':2,'لم يتعلم بعد':1};if(!vals.length){$('evaluationOverall').textContent='لم يتم تقييم أي مهارة بعد.';return;}const avg=vals.reduce((a,v)=>a+rank[v],0)/vals.length;const level=avg>=4.5?'ممتاز':avg>=3.7?'جيد':avg>=2.7?'متوسط':avg>=1.7?'ضعيف':'يحتاج إلى تدريب أساسي';$('evaluationOverall').textContent=`المستوى العام: ${level} — ${vals.length}/${PRACTICAL_SKILLS.length} مهارات تم تقييمها`;}
function savePracticalEvaluation(){const c=candidate(val('scheduleCandidate')),i=Number(val('evaluationSession'));if(!c||!val('evaluationSession')){alert('اختر الحصة التطبيقية أولاً.');return;}const skills=PRACTICAL_SKILLS.map((_,n)=>val(`evalSkill${n}`));if(!skills.some(Boolean)){alert('قيّم مهارة واحدة على الأقل قبل الحفظ.');return;}c.practicalEvaluations||={};c.practicalEvaluations[i]={date:val('evaluationDate'),skills,notes:val('evaluationNotes'),nextFocus:val('evaluationNextFocus'),updatedAt:new Date().toISOString()};persist();renderEvaluationHistory(c);updateEvaluationOverall();alert('تم حفظ تقييم الحصة وملاحظات المدرب.');}
function renderEvaluationHistory(c){const body=$('evaluationHistory');if(!body)return;const items=Object.entries(c?.practicalEvaluations||{}).map(([i,e])=>({i:Number(i),...e})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));body.innerHTML=items.map(e=>{const vals=(e.skills||[]).filter(Boolean),rank={'ممتاز':5,'جيد':4,'متوسط':3,'ضعيف':2,'لم يتعلم بعد':1},avg=vals.length?vals.reduce((a,v)=>a+(rank[v]||0),0)/vals.length:0,level=!vals.length?'غير محدد':avg>=4.5?'ممتاز':avg>=3.7?'جيد':avg>=2.7?'متوسط':avg>=1.7?'ضعيف':'يحتاج إلى تدريب أساسي';return `<tr><td>${esc(e.date||'—')}</td><td>الحصة ${e.i+1}</td><td>${level}</td><td>${esc(e.notes||e.nextFocus||'—')}</td></tr>`}).join('')||'<tr><td colspan="4">لا توجد تقييمات مسجلة بعد.</td></tr>';}

function updateSession(id,i,k,v){let c=candidate(id);c.sessions[i][k]=v;storage.setItem(KEY,JSON.stringify(db));refreshCountsOnly()}
function refreshCountsOnly(){let all=db.candidates.flatMap(c=>c.sessions);$('mDone').textContent=all.filter(s=>s.status==='منجزة').length;$('mRemain').textContent=all.length-Number($('mDone').textContent)}
function saveContractGuardianField(key,value){const c=candidate(val('contractCandidate'));if(!c)return;if(/phone/i.test(key))value=formatAlgerianPhone(value);c[key]=value;const input=$('legalRepPhoneInput');if(/phone/i.test(key)&&input&&document.activeElement===input)input.value=value;storage.setItem(KEY,JSON.stringify(db));renderContractGuardian(c);}
function renderContractGuardian(c){const put=(id,v)=>{if($(id))$(id).textContent=v||'';};const set=(id,v)=>{if($(id)&&document.activeElement!==$(id))$(id).value=v||'';};put('contractLegalRepSurname',c?.legalRepSurname||'');put('contractLegalRepName',c?.legalRepName||'');put('contractLegalRepBirth',c?.legalRepBirth?formatOfficialDate(c.legalRepBirth):'');put('contractLegalRepBirthPlace',c?.legalRepBirthPlace||'');put('contractLegalRepAddress',c?.legalRepAddress||'');put('contractLegalRepPhone',formatAlgerianPhone(c?.legalRepPhone||''));set('legalRepSurnameInput',c?.legalRepSurname);set('legalRepNameInput',c?.legalRepName);set('legalRepBirthInput',c?.legalRepBirth);set('legalRepBirthPlaceInput',c?.legalRepBirthPlace);set('legalRepAddressInput',c?.legalRepAddress);set('legalRepPhoneInput',formatAlgerianPhone(c?.legalRepPhone||''));}
function renderContract(){const c=candidate(val('contractCandidate'));const put=(id,v)=>{if($(id))$(id).textContent=v||'';};put('contractSurname',c?.surnameAr||c?.surname||'');put('contractName',c?.nameAr||c?.name||'');put('contractCandidateFull',[c?.surnameAr||c?.surname,c?.nameAr||c?.name].filter(Boolean).join(' '));put('contractCandidateBirth',c?.birth?formatOfficialDate(c.birth):'');put('contractBirthPlace',[c?.birthPlace,c?.birthWilaya].filter(Boolean).join('، '));put('contractAddress',c?.address||'');put('contractPhone',formatAlgerianPhone(c?.phone||''));renderContractGuardian(c);updateContractOwner();}
const EXAM_STAGES=['قانون المرور','المناورات','السياقة'];
function stageOf(c){return c.examStage||'قانون المرور'}
function examStatus(c,stage){return (c.examResults||{})[stage]||'لم يمتحن'}
function parseExamDateOnly(value){
 if(!value)return null;
 const raw=String(value).trim();let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!m){m=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)m=[m[0],m[3],m[2],m[1]];}
 if(!m)return null;const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
 const d=new Date(Date.UTC(y,mo-1,day));if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mo-1||d.getUTCDate()!==day)return null;
 return {y,mo,day,time:d.getTime()};
}
function dateBefore(x){const p=parseExamDateOnly(x);if(!p)return '';return new Date(p.time-86400000).toISOString().slice(0,10)}
function ageAtDate(birth,at){const b=parseExamDateOnly(birth),d=parseExamDateOnly(at);if(!b||!d)return -1;let age=d.y-b.y;if(d.mo<b.mo||(d.mo===b.mo&&d.day<b.day))age--;return age}
function examEligibility(c,stage=stageOf(c)){
 if(stage!=='السياقة')return {eligible:true,reason:''};
 const examDate=val('examDate');if(!parseExamDateOnly(examDate))return {eligible:false,reason:'حدد تاريخ الامتحان أولاً'};
 const birth=c&&(c.birth||c.dateBirth||c.birthDate||c.dateNaissance);
 if(!parseExamDateOnly(birth))return {eligible:false,reason:'تاريخ الميلاد غير مسجل أو غير صحيح'};
 const cutoff=dateBefore(examDate),age=ageAtDate(birth,cutoff);
 return age>=18?{eligible:true,reason:''}:{eligible:false,reason:'غير مؤهل: يجب أن يبلغ 18 سنة كاملة قبل يوم الامتحان بيوم على الأقل'};
}
function examEligible(c,stage=stageOf(c)){return examEligibility(c,stage).eligible}
function activeExamBatch(){return db.examBatches.find(b=>b.id===db.activeExamBatchId&&!b.closed)}
function renderExamSelectors(){db.examBatches ||= [];db.examArchive ||= [];db.examClosedCandidates ||= [];renderExam();renderExamArchive()}
function findLastVisibleExamCandidateRow(table){
 if(!table || typeof table.querySelectorAll!=='function') return -1;
 const rows=Array.from(table.querySelectorAll('tbody tr')).slice(0,30);
 for(let i=rows.length-1;i>=0;i--){const cell=rows[i].querySelector('td.person-name');if(cell&&String(cell.textContent||'').replace(/\s+/g,'').length>0)return i;}
 return -1;
}
/* Automatic strike belongs to the actual empty table row, not to a separate drawing layer. */
function updateExamStrike(lastFilled){
 const table=document.querySelector('#examPrint .exam-official');
 if(!table)return;
 const rows=Array.from(table.querySelectorAll('tbody tr')).slice(0,30);
 rows.forEach(row=>row.classList.remove('exam-strike-row'));
 const last=Number.isInteger(lastFilled)?lastFilled:findLastVisibleExamCandidateRow(table);
 if(last<0||last>=29)return; // no strike for an empty list or a full 30-candidate list
 const nextRow=rows[last+1];
 if(!nextRow)return;
 const nameCell=nextRow.querySelector('td.person-name');
 if(nameCell&&!String(nameCell.textContent||'').trim()){
  nextRow.classList.add('exam-strike-row');
 }
}

function renderExam(){
 const selected=val('examType')||'قانون المرور';
 db.candidates.forEach(c=>{c.examStage ||= 'قانون المرور';c.examResults ||= {};});
 let eligible=db.candidates.filter(c=>c.lifecycleStatus==='active'&&(selected==='كل المراحل'||stageOf(c)===selected)&&EXAM_STAGES.includes(stageOf(c))&&!c.examClosedAt&&examEligible(c,stageOf(c)));
 $('examEligibleCount').textContent=eligible.length;
 $('examCodeCount').textContent=db.candidates.filter(c=>c.lifecycleStatus==='active'&&stageOf(c)==='قانون المرور'&&!c.examClosedAt).length;
 $('examManeuverCount').textContent=db.candidates.filter(c=>c.lifecycleStatus==='active'&&stageOf(c)==='المناورات'&&!c.examClosedAt).length;
 $('examDriveCount').textContent=db.candidates.filter(c=>c.lifecycleStatus==='active'&&stageOf(c)==='السياقة'&&!c.examClosedAt).length;
 let choices='';
 let stageCandidates=db.candidates.filter(c=>c.lifecycleStatus==='active'&&(selected==='كل المراحل'||stageOf(c)===selected)&&EXAM_STAGES.includes(stageOf(c))&&!c.examClosedAt).sort((a,b)=>EXAM_STAGES.indexOf(stageOf(a))-EXAM_STAGES.indexOf(stageOf(b))||full(a).localeCompare(full(b),'ar'));
 stageCandidates.forEach(c=>{let stg=stageOf(c),elig=examEligibility(c,stg),ok=elig.eligible;let reason=elig.reason;choices+=`<tr><td>${ok?`<input type="checkbox" class="exam-choice" value="${esc(c.id)}">`:'—'}</td><td>${esc(c.reg||'')}</td><td>${esc(full(c))}</td><td>${esc(formatOfficialDate(c.birth||c.dateBirth||c.birthDate||c.dateNaissance))}</td><td>${esc(stg)}</td><td>${ok?'<span class="pill">مؤهل</span>':`<span style="color:#b42318;font-weight:bold">${esc(reason)}</span>`}</td></tr>`});
 $('examCandidateChoices').innerHTML=choices||'<tr><td colspan="6">لا يوجد مترشحون في هذه المرحلة</td></tr>';
 let batch=activeExamBatch();
 if(!batch){updateExamStrike(-1);$('examBatchInfo').textContent='لا توجد قائمة امتحان مفتوحة. اختر المترشحين وأنشئ قائمة جديدة.';$('examRows').innerHTML='';$('examCountsRows').innerHTML='';}
 else {
  $('examBatchInfo').innerHTML=`القائمة المفتوحة: <b>${batch.stage}</b> — تاريخ الامتحان: <b>${formatOfficialDate(batch.date)}</b> — السنة: <b>${batch.year}</b> — عدد المترشحين: <b>${batch.candidateIds.length}</b>`;
  let rows='';const ids=batch.candidateIds.slice(0,30);let lastFilled=-1;
  for(let i=0;i<30;i++){
   const id=ids[i],c=id?candidate(id):null;
   const stage=c?(batch.candidateStages||{})[id]||batch.stage:'';
   const st=id?(batch.results[id]||'لم يمتحن'):'';
   const endClass='';
   rows+=`<tr class="${endClass.trim()}">${i===0?`<td class="vehicle-value" rowspan="30">${esc(batch.vehicle||'')}</td>`:''}<td>${i+1}</td><td>${c?esc(c.reg||''):''}</td><td class="person-name">${c?esc(full(c)):''}</td><td>${c?esc(formatOfficialDate(c.birth)):''}</td><td>${c?esc(c.category||''):''}</td><td>${c?esc(stage):''}</td><td>${c?esc(formatOfficialDate(c.lastExamDate||'')):''}</td><td></td><td class="no-print">${c?`<select aria-label="نتيجة الامتحان" onchange="setExamResult('${c.id}',this.value)"><option ${st==='لم يمتحن'?'selected':''}>لم يمتحن</option><option ${st==='ناجح'?'selected':''}>ناجح</option><option ${st==='راسب'?'selected':''}>راسب</option><option ${st==='غائب'?'selected':''}>غائب</option></select>`:''}</td></tr>`;
  }
  $('examRows').innerHTML=rows;
  lastFilled=findLastVisibleExamCandidateRow(document.querySelector('#examPrint .exam-official'));
  updateExamStrike(lastFilled);
  $('examCountsRows').innerHTML=EXAM_STAGES.map(stage=>{let ids=batch.candidateIds.filter(id=>(batch.candidateStages||{})[id]===stage);let passed=ids.filter(id=>batch.results[id]==='ناجح').length;return `<tr><td>${stage}</td><td>${ids.length}</td><td>${passed||''}</td></tr>`}).join('')+`<tr><th>المجموع</th><th>${batch.candidateIds.length}</th><th>${batch.candidateIds.filter(id=>batch.results[id]==='ناجح').length||''}</th></tr>`;
 }
 $('examCenterPrint').textContent=batch?.center||val('examCenter');$('examDatePrint').textContent=formatOfficialDate(batch?.date||val('examDate'));$('depositDatePrint').textContent=formatOfficialDate(batch?.depositDate||val('depositDate'));$('examWilayaPrint').textContent='لولاية '+String((db.settings||{}).agencyWilaya||'').trim();$('examInspectorPrint').textContent=batch?.inspector||val('examInspector');
}
function examSmsText(stage,date){return `أنت مدعو إلى امتحان ${stage} بتاريخ ${formatOfficialDate(date)}.\nإجباري إحضار بطاقة التعريف الوطنية.\nممنوع اللباس الرياضي أو السروال القصير.`;}
let examSmsSequence={batchId:null,ids:[],index:0};
function examSmsPhone(id,b){const c=candidate(id);const snap=(b.candidateSnapshots||[]).find(x=>x.id===id);return String(c?.phone||snap?.phone||'').trim();}
function updateExamSmsProgress(){const p=$('examSmsProgress'),n=$('examSmsNextBtn');if(!p||!n)return;const total=examSmsSequence.ids.length,done=examSmsSequence.index;p.textContent=total?`تم فتح ${done} من ${total} رسالة — المتبقي ${Math.max(0,total-done)}`:'لا توجد أرقام هواتف صالحة في القائمة';n.disabled=!total||done>=total;}
function openExamSmsPanel(){
 const b=activeExamBatch();if(!b){alert('أنشئ قائمة الامتحان أولاً.');return;}
 examSmsSequence={batchId:b.id,ids:[],index:0};
 const rows=b.candidateIds.slice(0,30).map((id,i)=>{const c=candidate(id);const name=c?full(c):(b.candidateSnapshots||[]).find(x=>x.id===id)?.name||'مترشح';const phone=examSmsPhone(id,b);const stage=(b.candidateStages||{})[id]||b.stage;return `<div class="exam-sms-row"><div><span class="sms-person">${i+1}. ${esc(name)}</span><small>${esc(phone||'لا يوجد رقم هاتف مسجل')} — ${esc(stage)}</small></div><button class="btn greenbtn" type="button" ${phone?'':'disabled'} onclick="openCandidateSmsByIndex(${i})">فتح SMS</button></div>`;}).join('');
 $('examSmsRows').innerHTML=rows||'<p>لا يوجد مترشحون في القائمة.</p>';$('examSmsOverlay').classList.add('open');$('examSmsOverlay').setAttribute('aria-hidden','false');updateExamSmsProgress();
}
function closeExamSmsPanel(){const el=$('examSmsOverlay');if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');}}
function openCandidateSmsByIndex(index){const b=activeExamBatch();if(!b||!Number.isInteger(index)||index<0||index>=b.candidateIds.length)return;openCandidateSms(b.candidateIds[index]);}
function startExamSmsSequence(){const b=activeExamBatch();if(!b){alert('أنشئ قائمة الامتحان أولاً.');return;}examSmsSequence={batchId:b.id,ids:b.candidateIds.slice(0,30).filter(id=>examSmsPhone(id,b)),index:0};if(!examSmsSequence.ids.length){updateExamSmsProgress();alert('لا توجد أرقام هواتف مسجلة للمترشحين في هذه القائمة.');return;}openNextExamSms();}
function openNextExamSms(){const b=activeExamBatch();if(!b||b.id!==examSmsSequence.batchId){alert('قائمة الامتحان تغيرت. أعد فتح نافذة الرسائل.');return;}if(examSmsSequence.index>=examSmsSequence.ids.length){updateExamSmsProgress();alert('تم فتح رسائل جميع المترشحين الذين لديهم أرقام هاتف.');return;}const id=examSmsSequence.ids[examSmsSequence.index++];updateExamSmsProgress();openCandidateSms(id);}
function openCandidateSms(id){
 const b=activeExamBatch();if(!b||!b.candidateIds.includes(id)){alert('تعذر العثور على المترشح في القائمة الحالية.');return;}
 const c=candidate(id);const phone=examSmsPhone(id,b);if(!phone){alert('رقم هاتف هذا المترشح غير مسجل.');return;}
 const stage=(b.candidateStages||{})[id]||b.stage;const body=examSmsText(stage,b.date);const clean=phone.replace(/[\s()-]/g,'');
 const uri=`sms:${clean}?body=${encodeURIComponent(body)}`;window.location.href=uri;
}
function toggleExamCandidates(on){document.querySelectorAll('.exam-choice').forEach(x=>x.checked=on)}
function createExamBatch(){
 let date=val('examDate');if(!date){alert('يرجى تحديد تاريخ الامتحان أولاً.');return;}
 if(activeExamBatch()){alert('توجد قائمة امتحان مفتوحة. أنهِها وأرشفها قبل إنشاء قائمة جديدة.');return;}
 let ids=[...document.querySelectorAll('.exam-choice:checked')].map(x=>x.value);
 if(ids.length>30){alert('القائمة الواحدة لا تتجاوز 30 مترشحاً. ألغِ تحديد بعض الأسماء وأنشئ قائمة أخرى للبقية.');return;}
 if(!ids.length){alert('اختر مترشحاً واحداً على الأقل.');return;}
 let selected=val('examType');let invalid=ids.map(id=>candidate(id)).filter(c=>!c||!EXAM_STAGES.includes(stageOf(c))||(selected!=='كل المراحل'&&stageOf(c)!==selected)||c.examClosedAt||!examEligible(c,stageOf(c)));
 if(invalid.length){const names=invalid.map(c=>c?full(c):'مترشح غير موجود').join('، ');alert('تعذر إنشاء القائمة. يوجد مترشح غير مستوفٍ للشروط أو تغيّرت مرحلته:\n'+names+'\nراجع تاريخ الميلاد وتاريخ الامتحان ومرحلة المترشح.');renderExam();return;}
 let valid=ids;
 if(!valid.length)return;
 let candidateStages=Object.fromEntries(valid.map(id=>[id,stageOf(candidate(id))]));let uniqueStages=[...new Set(Object.values(candidateStages))];let batch={id:'exam'+Date.now(),stage:uniqueStages.length===1?uniqueStages[0]:'مراحل متعددة',candidateStages,date,year:Number(date.slice(0,4)),depositDate:val('depositDate'),center:val('examCenter'),wilaya:val('examWilaya'),inspector:val('examInspector'),vehicle:val('examVehicle'),candidateIds:valid,candidateSnapshots:valid.map(id=>{let c=candidate(id);return {id,reg:c.reg||'',name:full(c),phone:c.phone||'',birth:c.birth||'',category:c.category||'',stage:candidateStages[id]}}),results:{},closed:false,createdAt:new Date().toISOString()};
 db.examBatches.push(batch);db.activeExamBatchId=batch.id;persist();renderExam();alert('تم إنشاء قائمة الامتحان. أدخل نتيجة كل مترشح بعد الامتحان.');
}
function setExamResult(id,result){let b=activeExamBatch();if(!b||!b.candidateIds.includes(id))return;let c=candidate(id);if(!c)return;let stage=(b.candidateStages||{})[id]||b.stage;b.results[id]=result;c.examResults ||= {};c.examHistory ||= [];c.examResults[stage]=result;if(result!=='لم يمتحن'){c.lastExamDate=b.date;c.examHistory=c.examHistory.filter(h=>h.batchId!==b.id||h.stage!==stage);c.examHistory.push({date:b.date,stage,result,year:b.year,batchId:b.id});if(result==='ناجح'){let next=EXAM_STAGES[EXAM_STAGES.indexOf(stage)+1];c.examStage=next||'مكتمل';if(!next){c.examClosedAt=b.date;c.examFinalStatus='ناجح في المراحل الثلاث';db.examClosedCandidates ||= [];if(!db.examClosedCandidates.includes(id))db.examClosedCandidates.push(id);}}else{c.examStage=stage;}}persist();renderExam();}
function closeExamBatch(){let b=activeExamBatch();if(!b){alert('لا توجد قائمة مفتوحة لإغلاقها.');return;}let missing=b.candidateIds.filter(id=>!['ناجح','راسب','غائب','لم يمتحن'].includes(b.results[id]||'لم يمتحن'));if(missing.length){alert('يرجى تحديد نتيجة كل مترشح قبل إغلاق القائمة.');return;}if(!confirm('سيتم إغلاق قائمة هذا الامتحان وحفظها في أرشيف سنة '+b.year+'. هل تريد المتابعة؟'))return;b.closed=true;b.closedAt=new Date().toISOString();db.examArchive ||= [];db.examArchive.push(JSON.parse(JSON.stringify(b)));db.activeExamBatchId=null;persist();renderExam();renderExamArchive();alert('تم إغلاق القائمة وحفظها في الأرشيف السنوي.');}
function renderExamArchive(){let y=$('examArchiveYear')?.value||'all';let years=[...new Set((db.examArchive||[]).map(b=>String(b.year)))].sort().reverse();if($('examArchiveYear')){let old=y;$('examArchiveYear').innerHTML='<option value="all">كل السنوات</option>'+years.map(v=>`<option value="${v}">${v}</option>`).join('');$('examArchiveYear').value=years.includes(old)?old:'all';y=$('examArchiveYear').value;}
 let items=(db.examArchive||[]).filter(b=>y==='all'||String(b.year)===y).sort((a,b)=>b.date.localeCompare(a.date));$('examArchiveRows').innerHTML=items.map(b=>{let n=b.candidateIds.length,pass=Object.values(b.results).filter(x=>x==='ناجح').length,fail=Object.values(b.results).filter(x=>x==='راسب').length,abs=Object.values(b.results).filter(x=>x==='غائب').length,not=Object.values(b.results).filter(x=>x==='لم يمتحن').length;let people=(b.candidateSnapshots||b.candidateIds.map(id=>({id,name:candidate(id)?full(candidate(id)):'مترشح',stage:(b.candidateStages||{})[id]||b.stage}))).map(c=>`${esc(c.name)} — ${esc(c.stage||'')} (${esc(b.results[c.id]||'لم يمتحن')})`).join('، ');return `<tr><td>${formatOfficialDate(b.date)}</td><td>${esc(b.stage)}</td><td>${n}</td><td>${people}<br><small>ناجح: ${pass} — راسب: ${fail} — غائب: ${abs} — لم يمتحن: ${not}</small></td><td>${b.year}</td></tr>`}).join('')||'<tr><td colspan="5">لا توجد امتحانات مؤرشفة لهذه السنة</td></tr>';
 $('examClosedRows').innerHTML=(db.examClosedCandidates||[]).map(id=>candidate(id)).filter(Boolean).map(c=>`<tr><td>${esc(c.reg||'')}</td><td>${esc(full(c))}</td><td>${formatOfficialDate(c.examClosedAt)}</td><td>${esc(c.examFinalStatus||'ناجح في المراحل الثلاث')}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد ملفات مغلقة بعد</td></tr>';
}
function formatDate(x){if(!x)return '';let a=x.split('-');return a.length===3?`${a[2]}/${a[1]}/${a[0]}`:x}
function formatOfficialDate(x){return x?String(x).replaceAll('-','/'):''}
function setFormOffset(){const el=$('candidateFormPrint');if(!el)return;el.style.setProperty('--dx',(Number(val('formDx'))||0)+'mm');el.style.setProperty('--dy',(Number(val('formDy'))||0)+'mm');applyPrintPositions('form')}
function positionScopeConfig(scope){return scope==='form'?{root:'candidateFormPrint',select:'formPositionField',step:'formPositionStep',status:'formPositionStatus',selector:'.v'}:{root:'contractPrint',select:'contractPositionField',step:'contractPositionStep',status:'contractPositionStatus',selector:'.cv'};}
function applyPrintPositions(scope){const cfg=positionScopeConfig(scope),root=$(cfg.root);if(!root)return;root.querySelectorAll(cfg.selector).forEach(el=>{let key=Array.from(el.classList).find(c=>scope==='form'?c.startsWith('f-'):c.startsWith('c-'));if(!key)return;let pos=(printPositions[scope]||{})[key]||{x:0,y:0};el.style.setProperty('--move-x',(Number(pos.x)||0)+'mm');el.style.setProperty('--move-y',(Number(pos.y)||0)+'mm');});}
function showPositionStatus(scope){const cfg=positionScopeConfig(scope),key=val(cfg.select),p=((printPositions[scope]||{})[key]||{x:0,y:0});$(cfg.status).textContent=`الإزاحة: أفقي ${Number(p.x)||0} مم، عمودي ${Number(p.y)||0} مم`;}
function movePrintField(scope,axis,direction){const cfg=positionScopeConfig(scope),key=val(cfg.select),step=Number(val(cfg.step))||1;printPositions[scope] ||= {};printPositions[scope][key] ||= {x:0,y:0};let p=printPositions[scope][key];p[axis]=Math.round(((Number(p[axis])||0)+step*direction)*10)/10;applyPrintPositions(scope);showPositionStatus(scope);}
function resetPrintField(scope){const cfg=positionScopeConfig(scope),key=val(cfg.select);if(printPositions[scope])delete printPositions[scope][key];applyPrintPositions(scope);showPositionStatus(scope);}
function resetPrintPositions(scope){const name=scope==='form'?'الاستمارة':'عقد التعليم';if(!confirm('هل تريد استعادة المواضع الأصلية لجميع خانات '+name+'؟ اضغط حفظ التعديلات لتثبيت الاستعادة.'))return;delete printPositions[scope];applyPrintPositions(scope);showPositionStatus(scope);}
function savePrintPositions(scope){let saved={};try{saved=JSON.parse(storage.getItem(PRINT_POS_KEY)||'{}')||{};}catch(e){}saved[scope]=JSON.parse(JSON.stringify(printPositions[scope]||{}));storage.setItem(PRINT_POS_KEY,JSON.stringify(saved));const cfg=positionScopeConfig(scope);$(cfg.status).textContent='تم حفظ تعديلات '+(scope==='form'?'الاستمارة':'عقد التعليم')+' على هذا الجهاز.';}
function renderCandidateFormData(c){if(!c)return false;const f=(cls,v)=>{const sc=smartScriptOf(v);return `<span class="v ${cls} ${sc==='ar'?'lang-ar':sc==='fr'?'lang-fr':''}">${esc(v||'')}</span>`};const mark=(cls,selected)=>`<span class="v ${cls} form-choice-mark">${selected?'×':''}</span>`;const gender=String(c.gender||'').trim();const marital=String(c.marital||'').trim();$('candidateFormPrint').innerHTML=[f('f-agency-wilaya',((db.settings||{}).agencyWilaya||'').trim()),f('f-name',c.nameAr),f('f-surname',c.surnameAr),f('f-latinname latin',c.nameLat),f('f-latinsurname latin',c.surnameLat),f('f-birth',formatDate(c.birth)),f('f-blood',c.blood),f('f-father',c.father),f('f-mother',c.mother),f('f-commune',c.commune),f('f-wilaya',c.wilaya),f('f-category',c.category),f('f-address',c.address),f('f-phone',formatAlgerianPhone(c.phone||'')),f('f-nationality',c.nationality),f('f-nationalid latin',c.nationalId),...(isCategoryB(c.category)?[mark('f-gender-male',gender==='ذكر'),mark('f-gender-female',gender==='أنثى'),f('f-birthplace',c.birthPlace),f('f-birth-wilaya',c.birthWilaya),mark('f-marital-single',marital==='أعزب/عزباء'),mark('f-marital-married',marital==='متزوج(ة)'),mark('f-marital-divorced',marital==='مطلق(ة)'),mark('f-marital-widowed',marital==='أرمل(ة)')]:[])].join('');setFormOffset();applyPrintPositions('form');return true;}
function previewCandidateForm(){const id=val('formPrepCandidate');const c=candidate(id);if(!c){alert('اختر مترشحاً أولاً.');return;}renderCandidateFormData(c);show('formPrep');}
function printPreparedForm(){const id=val('formPrepCandidate');const c=candidate(id);if(!c){alert('اختر مترشحاً أولاً.');return;}renderCandidateFormData(c);printPage('formPrep','candidateFormPrint');}
function printCandidateForm(id){let c=candidate(id||val('editId'));if(!c){let reg=val('reg');c=db.candidates.find(x=>x.reg===reg)}if(!c){alert('احفظ المترشح أولاً ثم اختره من القائمة واضغط تعديل، أو أدخل رقم ملفه واحفظه.');return;}const sel=$('formPrepCandidate');if(sel)sel.value=c.id;renderCandidateFormData(c);printPage('formPrep','candidateFormPrint');}

function picked(className){return Array.from(document.querySelectorAll('.'+className+':checked')).map(el=>candidate(el.value)).filter(Boolean)}
function dispatchEligible(c){const history=Array.isArray(c.examHistory)?c.examHistory:[];const results=c.examResults&&typeof c.examResults==='object'?Object.values(c.examResults):[];return !String(c.reg||'').trim()&&!history.length&&!results.length&&!c.lastExamDate&&!c.examClosedAt&&!['مكتمل'].includes(c.examStage||'');}
function renderDispatch(){let box=$('dispatchChecks');if(!box)return;let eligible=(db.candidates||[]).filter(dispatchEligible);box.innerHTML=eligible.map(c=>`<label style="display:inline-flex;gap:6px;margin:7px 14px 7px 0"><input type="checkbox" class="dispatchPick" value="${esc(String(c.id))}" onchange="renderDispatchRows()">${esc(full(c))}</label>`).join('')||'<p class="note">لا توجد ملفات جديدة مستوفية لشروط كشف الإرسال حالياً.</p>';renderDispatchRows();renderDispatchArchive();}
function renderDispatchRows(){let list=picked('dispatchPick');$('dispatchRows').innerHTML=list.map(c=>`<tr><td><input class="dispatchReg" data-cid="${esc(String(c.id))}" value="${esc(c.reg||'')}" placeholder="أدخل رقم التسجيل" style="width:95px" oninput="updateDispatchReg(this)"></td><td>${esc(full(c))}</td><td>${esc(formatOfficialDate(c.birth))}</td><td>${esc(c.category)}</td><td>${esc(c.remarks||'')}</td></tr>`).join('');$('dispatchWilayaPrint').textContent=val('dispatchWilaya');$('dispatchWilayaRecipient').textContent=val('dispatchWilaya');$('dispatchDatePrint').textContent=formatOfficialDate(val('dispatchDate'));}
function updateDispatchReg(el){const c=candidate(el.dataset.cid);if(!c)return;c.reg=el.value.trim();try{storage.setItem(KEY,JSON.stringify(db));}catch(e){console.error('تعذر حفظ رقم التسجيل',e);}}
function saveDispatchArchiveAndPrint(){const list=picked('dispatchPick');if(!list.length){alert('اختر مترشحاً واحداً على الأقل.');return;}const missing=list.filter(c=>!String(c.reg||'').trim());if(missing.length){alert('أدخل رقم تسجيل الملف لكل مترشح مختار قبل حفظ الكشف.');return;}if(!val('dispatchDate')){alert('حدد تاريخ الإرسال أولاً.');return;}const record={id:'dispatch'+Date.now(),date:val('dispatchDate'),wilaya:val('dispatchWilaya'),createdAt:new Date().toISOString(),candidates:list.map(c=>({id:c.id,reg:c.reg,name:full(c),birth:c.birth||'',category:c.category||'',remarks:c.remarks||''}))};db.dispatchArchive ||= [];db.dispatchArchive.push(record);persist();renderDispatchArchive();dispatchPrintOverride=record;renderDispatchRowsFromRecord(record);printPage('dispatch');}
let dispatchPrintOverride=null;
function renderDispatchRowsFromRecord(record){$('dispatchRows').innerHTML=record.candidates.map(c=>`<tr><td>${esc(c.reg)}</td><td>${esc(c.name)}</td><td>${esc(formatOfficialDate(c.birth))}</td><td>${esc(c.category)}</td><td>${esc(c.remarks||'')}</td></tr>`).join('');$('dispatchWilayaPrint').textContent=record.wilaya||'';$('dispatchWilayaRecipient').textContent=record.wilaya||'';$('dispatchDatePrint').textContent=formatOfficialDate(record.date);}
function renderDispatchArchive(){const body=$('dispatchArchiveRows');if(!body)return;body.innerHTML=(db.dispatchArchive||[]).slice().reverse().map(r=>`<tr><td>${esc(formatOfficialDate(r.date))}</td><td>${esc(r.wilaya||'')}</td><td>${(r.candidates||[]).length}</td><td><button class="btn gray" onclick="printDispatchArchive('${esc(r.id)}')">عرض / طباعة PDF</button></td></tr>`).join('')||'<tr><td colspan="4">لا توجد كشوف محفوظة بعد.</td></tr>';}
function printDispatchArchive(id){const r=(db.dispatchArchive||[]).find(x=>String(x.id)===String(id));if(!r)return;dispatchPrintOverride=r;renderDispatchRowsFromRecord(r);printPage('dispatch');}
function reportDateOf(x){return x?.date||x?.createdAt||x?.registrationDate||x?.registeredAt||x?.createdOn||x?.regDate||'';}
function reportInRange(x){const d=String(reportDateOf(x)).slice(0,10),from=val('reportFrom'),to=val('reportTo');return (!from||!d||d>=from)&&(!to||!d||d<=to);}
function reportBar(label,count,total){const pct=total?Math.round(count/total*100):0;return `<div class="report-bar-row"><span>${esc(label)}</span><div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div><b>${count}</b></div>`;}
function renderMonthlyReport(){
 const monthEl=$('reportMonth');if(!monthEl)return;const now=new Date(),month=monthEl.value||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;if(!monthEl.value)monthEl.value=month;
 const sameMonth=x=>String(x.date||reportDateOf(x)||'').slice(0,7)===month;
 const monthCandidates=(db.candidates||[]).filter(c=>String(reportDateOf(c)).slice(0,7)===month);
 const pays=(db.payments||[]).filter(sameMonth),costs=(db.expenses||[]).filter(sameMonth);
 const income=pays.reduce((a,x)=>a+Number(x.amount||0),0),out=costs.reduce((a,x)=>a+Number(x.amount||0),0);
 const put=(id,v)=>{if($(id))$(id).textContent=v;};put('rmCandidates',monthCandidates.length);put('rmIncome',money(income));put('rmExpenses',money(out));put('rmNet',money(income-out));
 const base=new Date(now.getFullYear(),now.getMonth()-5,1),months=[];for(let i=0;i<6;i++){const d=new Date(base.getFullYear(),base.getMonth()+i,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push({key,label:d.toLocaleDateString('ar-DZ',{month:'short'}),in:(db.payments||[]).filter(x=>String(x.date||'').slice(0,7)===key).reduce((a,x)=>a+Number(x.amount||0),0),out:(db.expenses||[]).filter(x=>String(x.date||'').slice(0,7)===key).reduce((a,x)=>a+Number(x.amount||0),0)});}
 const max=Math.max(1,...months.flatMap(x=>[x.in,x.out]));const chart=$('reportMonthChart');if(chart)chart.innerHTML=months.map(x=>`<div class="report-month-col" title="${esc(x.key)}"><div class="report-month-bars"><i style="height:${Math.max(2,x.in/max*100)}%" title="مقبوضات: ${esc(money(x.in))}"></i><i class="out" style="height:${Math.max(2,x.out/max*100)}%" title="مصروفات: ${esc(money(x.out))}"></i></div><small>${esc(x.label)}</small></div>`).join('');
}

function registrationDateOf(c){return String(c?.enroll||c?.registrationDate||c?.registeredAt||c?.regDate||'').slice(0,10);}
function renderAnnualRegistrations(){
 const yearEl=$('reportYear');if(!yearEl)return;const now=new Date(),year=Number(yearEl.value)||now.getFullYear();
 const all=(db.candidates||[]).filter(c=>(val('reportCategory')==='all'||String(c.category||'')===val('reportCategory')));
 const counts=Array(12).fill(0),names=['جانفي','فيفري','مارس','أفريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
 all.forEach(c=>{const d=registrationDateOf(c);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number(d.slice(0,4))!==year)return;const m=Number(d.slice(5,7))-1;if(m>=0&&m<12)counts[m]++;});
 const total=counts.reduce((a,b)=>a+b,0),monthsElapsed=year<now.getFullYear()?12:year>now.getFullYear()?0:now.getMonth()+1,elapsedTotal=counts.slice(0,monthsElapsed).reduce((a,b)=>a+b,0),average=monthsElapsed?Math.round(elapsedTotal/monthsElapsed*10)/10:0;
 const best=Math.max(...counts),bestIndex=best?counts.indexOf(best):-1,progress=total?Math.round(elapsedTotal/total*100):0;
 const put=(id,v)=>{if($(id))$(id).textContent=v;};put('ryTotal',total);put('ryAverage',String(average));put('ryBest',bestIndex<0?'—':names[bestIndex]+' ('+best+')');put('ryProgress',progress+'%');
 const chart=$('reportAnnualChart');if(!chart)return;const W=720,H=210,left=34,right=12,top=12,bottom=34,plotH=H-top-bottom,plotW=W-left-right,max=Math.max(1,...counts),cum=[];let run=0;counts.forEach(n=>{run+=n;cum.push(run);});
 const x=i=>left+(i+.5)*plotW/12,barW=plotW/12*.48,y=n=>top+plotH-(n/max)*plotH;
 const bars=counts.map((n,i)=>{const bh=n/max*plotH;return `<rect x="${(x(i)-barW/2).toFixed(1)}" y="${(top+plotH-bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" rx="5" fill="url(#annualBar)" opacity="${n?'.95':'.22'}"><title>${names[i]}: ${n} ملف</title></rect><text x="${x(i).toFixed(1)}" y="${(H-10).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor">${names[i]}</text>${n?`<text x="${x(i).toFixed(1)}" y="${Math.max(10,top+plotH-bh-5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">${n}</text>`:''}`;}).join('');
 const lineMax=Math.max(1,total),lineY=n=>top+plotH-(n/lineMax)*plotH,points=cum.map((n,i)=>`${x(i).toFixed(1)},${lineY(n).toFixed(1)}`).join(' '),dots=cum.map((n,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${lineY(n).toFixed(1)}" r="3.2" fill="#e3a13c"><title>التراكم حتى ${names[i]}: ${n}</title></circle>`).join('');
 const grid=[0,.5,1].map(f=>{const yy=top+plotH*(1-f);return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="currentColor" opacity=".12" stroke-dasharray="3 4"/>`;}).join('');
 chart.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="annualBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#45c7a5"/><stop offset="1" stop-color="#087f78"/></linearGradient></defs>${grid}${bars}<polyline points="${points}" fill="none" stroke="#e3a13c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

function renderReports(){
 const candidates=(db.candidates||[]),filtered=candidates.filter(c=>(val('reportCategory')==='all'||String(c.category||'')===val('reportCategory'))&&reportInRange(c));
 const sessions=filtered.flatMap(c=>Array.isArray(c.sessions)?c.sessions:[]),done=sessions.filter(x=>x.status==='منجزة').length,remaining=sessions.filter(x=>x.status!=='منجزة').length;
 const active=filtered.filter(c=>!['مكتمل','منتهي','مغلق'].includes(String(c.examStage||''))).length;
 const put=(id,v)=>{if($(id))$(id).textContent=v;};put('rTotal',filtered.length);put('rActive',active);put('rLessonsDone',done);put('rLessonsRemain',remaining);
 const cats={};filtered.forEach(c=>{const k=String(c.category||'غير محدد');cats[k]=(cats[k]||0)+1;});const catBox=$('reportCategories');if(catBox)catBox.innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,n])=>reportBar(k,n,filtered.length)).join('')||'<p class="note">لا توجد بيانات ضمن الفترة المحددة.</p>';
 const theory=sessions.filter(x=>x.type==='نظرية'),practical=sessions.filter(x=>x.type==='تطبيقية');const training=$('reportTraining');if(training)training.innerHTML=[reportBar('نظرية منجزة',theory.filter(x=>x.status==='منجزة').length,theory.length||1),reportBar('نظرية متبقية',theory.filter(x=>x.status!=='منجزة').length,theory.length||1),reportBar('تطبيقية منجزة',practical.filter(x=>x.status==='منجزة').length,practical.length||1),reportBar('تطبيقية متبقية',practical.filter(x=>x.status!=='منجزة').length,practical.length||1)].join('');
 const stages=['قانون المرور','المناورات','السياقة'],examRows=[];const buckets=stages.map(stage=>({stage,passed:0,failed:0,total:0}));
 filtered.forEach(c=>{const histories=Array.isArray(c.examHistory)&&c.examHistory.length?[...c.examHistory]:(c.examResults&&typeof c.examResults==='object'?Object.entries(c.examResults).map(([stage,result])=>({stage,result})):[]);histories.forEach(h=>{const st=String(h.stage||h.type||h.examType||''),b=buckets.find(x=>st.includes(x.stage)||x.stage.includes(st));if(!b)return;const status=String(h.result||h.status||h.outcome||'');if(!status)return;b.total++;if(/ناجح|نجح|success|passed/i.test(status))b.passed++;else if(/راسب|غائب|فشل|failed|absent/i.test(status))b.failed++;});});
 const er=$('reportExamRows');if(er)er.innerHTML=buckets.map(b=>`<tr><td>${b.stage}</td><td>${b.passed}</td><td>${b.failed}</td><td>${b.total}</td></tr>`).join('');
 const payments=(db.payments||[]).filter(reportInRange),expenses=(db.expenses||[]).filter(reportInRange),income=payments.reduce((a,x)=>a+Number(x.amount||0),0),out=expenses.reduce((a,x)=>a+Number(x.amount||0),0),debt=filtered.reduce((a,c)=>a+Math.max(0,36000-(db.payments||[]).filter(p=>String(p.candidateId)===String(c.id)).reduce((z,p)=>z+Number(p.amount||0),0)),0);
 put('rIncome',money(income));put('rExpenses',money(out));put('rNet',money(income-out));put('rDebt',money(debt));
 const months={};[...payments.map(x=>({...x,_kind:'in'})),...expenses.map(x=>({...x,_kind:'out'}))].forEach(x=>{const m=String(x.date||'').slice(0,7)||'غير محدد';months[m]||={in:0,out:0};months[m][x._kind]+=Number(x.amount||0);});const mr=$('reportMonthlyRows');if(mr)mr.innerHTML=Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,v])=>`<tr><td>${esc(m)}</td><td>${money(v.in)}</td><td>${money(v.out)}</td><td>${money(v.in-v.out)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد حركات مالية ضمن الفترة المحددة.</td></tr>';
 const recent=filtered.slice().sort((a,b)=>String(reportDateOf(b)).localeCompare(String(reportDateOf(a)))).slice(0,15),rr=$('reportRecentRows');if(rr)rr.innerHTML=recent.map(c=>{const ss=c.sessions||[],d=ss.filter(x=>x.status==='منجزة').length;return `<tr><td>${esc(full(c))}</td><td>${esc(c.category||'')}</td><td>${esc(c.reg||'—')}</td><td>${esc(String(reportDateOf(c)).slice(0,10)||'—')}</td><td>${d}</td><td>${ss.length-d}</td></tr>`}).join('')||'<tr><td colspan="6">لا توجد ملفات ضمن الاختيار.</td></tr>';
 renderMonthlyReport();renderAnnualRegistrations();const stamp=$('reportGeneratedAt');if(stamp)stamp.textContent='تاريخ إعداد التقرير: '+new Date().toLocaleString('ar-DZ');
}
function exportReportsCSV(){renderReports();const rows=[['الاسم واللقب','الصنف','رقم التسجيل','تاريخ التسجيل','عدد الحصص','الحصص المنجزة','الحصص المتبقية'],...(db.candidates||[]).filter(c=>(val('reportCategory')==='all'||String(c.category||'')===val('reportCategory'))&&reportInRange(c)).map(c=>{const s=c.sessions||[],d=s.filter(x=>x.status==='منجزة').length;return [full(c),c.category||'',c.reg||'',reportDateOf(c),s.length,d,s.length-d]})];const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='تقرير-مدرسة-السياقة.csv';a.click();URL.revokeObjectURL(a.href);}
function initReports(){const yearEl=$('reportYear');if(yearEl&&!yearEl.options.length){const current=new Date().getFullYear(),years=new Set([current]);(db.candidates||[]).forEach(c=>{const d=registrationDateOf(c);if(/^\d{4}-/.test(d))years.add(Number(d.slice(0,4)));});yearEl.innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');yearEl.value=String(current);}const cats=[...new Set((db.candidates||[]).map(c=>String(c.category||'')).filter(Boolean))].sort();const el=$('reportCategory');if(el){const old=el.value;el.innerHTML='<option value="all">كل الأصناف</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');el.value=cats.includes(old)?old:'all';}if($('reportFrom')&&!$('reportFrom').value)$('reportFrom').value=new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10);if($('reportTo')&&!$('reportTo').value)$('reportTo').value=localTodayISO();renderReports();}
function show(id){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));if(id==='reports')initReports();if(id==='archive')showArchiveTab('candidates');}
function showArchiveTab(tab){const candidates=tab==='candidates';const a=$('archiveCandidatesPanel'),b=$('archiveExpiredPanel'),ba=$('archiveTabCandidates'),bb=$('archiveTabExpired');if(a)a.hidden=!candidates;if(b)b.hidden=candidates;if(ba){ba.classList.toggle('active',candidates);ba.classList.toggle('bluebtn',candidates);ba.classList.toggle('gray',!candidates);ba.setAttribute('aria-selected',String(candidates));}if(bb){bb.classList.toggle('active',!candidates);bb.classList.toggle('bluebtn',!candidates);bb.classList.toggle('gray',candidates);bb.setAttribute('aria-selected',String(!candidates));}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.page));
let examPrintLastFilled=-1,activePrintPage=null,activePrintExtra=null;
function finishPrintLayout(){if(!activePrintPage)return;const id=activePrintPage,extra=activePrintExtra;$(id)?.classList.remove('printing','form-only');if(extra)$(extra)?.classList.remove('printing');activePrintPage=null;activePrintExtra=null;if(id==='exam'){renderExam(false);requestAnimationFrame(()=>{const b=activeExamBatch();updateExamStrike(b?Math.min(29,b.candidateIds.slice(0,30).length-1):-1,true);});}if(id==='dispatch'){dispatchPrintOverride=null;renderDispatch();}}
window.addEventListener('beforeprint',()=>{if($('exam')?.classList.contains('printing')){const b=activeExamBatch();examPrintLastFilled=findLastVisibleExamCandidateRow(document.querySelector('#examPrint .exam-official'));/* Print CSS is active here: measure and draw synchronously before the browser captures the page. */updateExamStrike(examPrintLastFilled,true);}});
window.addEventListener('afterprint',finishPrintLayout);
function printPage(id,extra){const page=$(id);if(!page){console.error('Print page not found:',id);alert('تعذر العثور على صفحة الطباعة.');return;}document.querySelectorAll('.page').forEach(p=>p.classList.remove('printing','form-only'));activePrintPage=id;activePrintExtra=extra||null;page.classList.add('printing');if(extra){const extraEl=$(extra);if(!extraEl){console.error('Print area not found:',extra);alert('تعذر العثور على محتوى الطباعة.');finishPrintLayout();return;}extraEl.classList.add('printing');page.classList.add('form-only');}if(id==='exam'){renderExam();const t=document.querySelector('#examPrint .exam-official');examPrintLastFilled=findLastVisibleExamCandidateRow(t);updateExamStrike(examPrintLastFilled,true);}if(id==='schedule')renderSchedule();/* Keep print() in the original click call stack: deferred callbacks can lose Chrome's user activation, especially on Android. */window.print();}
function exportData(){let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='نسخة-احتياطية-مدرسة-السياقة.json';a.click();URL.revokeObjectURL(a.href)}
function importData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let x=JSON.parse(r.result);if(!Array.isArray(x.candidates))throw 0;db=x;db.payments ||= [];db.expenses ||= [];db.vehicles ||= [];persist();alert('تم استيراد النسخة.')}catch{alert('ملف النسخة غير صالح.')}};r.readAsText(f)}
function clearAll(){if(confirm('سيتم حذف جميع بيانات المترشحين نهائياً من هذا المتصفح. هل أنت متأكد؟')){db={candidates:[],payments:[],expenses:[],vehicles:[]};persist()}}
if($('examType'))$('examType').value='كل المراحل';
repairPracticalDailyLimit();
['examWilaya','examCenter','examDate','depositDate','examInspector','examVehicle','examType'].forEach(id=>{const el=$(id);if(el){el.addEventListener('input',()=>renderExam());el.addEventListener('change',()=>renderExam());}});
['dispatchWilaya','dispatchDate'].forEach(id=>$(id).addEventListener('input',()=>{if(!dispatchPrintOverride)renderDispatchRows();}));

const SCHOOL_SETTING_IDS=['setSchoolName','setOwnerName','setApprovalNo','setApprovalDate','setOwnerBirth','setOwnerBirthPlace','setOwnerAddress','setProfessionalAddress','setOwnerRepresentative','setRepresentativeBirth','setRepresentativeBirthPlace','setTeachingCategories','setCandidateAccidentInsurance','setCommune','setDaira','setWilaya','setPhone','setEmail'];
function loadSchoolSettings(){db.settings ||= {};const st=db.settings;if(st.ownerCommune===undefined)st.ownerCommune=st.commune||'';if(st.ownerDaira===undefined)st.ownerDaira=st.daira||'';if(st.ownerWilaya===undefined)st.ownerWilaya=st.wilaya||'';if(st.professionalCommune===undefined)st.professionalCommune=st.commune||'';if(st.professionalDaira===undefined)st.professionalDaira=st.daira||'';if(st.professionalWilaya===undefined)st.professionalWilaya=st.wilaya||'';const map={setSchoolName:'schoolName',setOwnerName:'ownerName',setApprovalNo:'approvalNo',setApprovalDate:'approvalDate',setOwnerBirth:'ownerBirth',setOwnerBirthPlace:'ownerBirthPlace',setOwnerAddress:'ownerAddress',setProfessionalAddress:'professionalAddress',setOwnerRepresentative:'ownerRepresentative',setRepresentativeBirth:'representativeBirth',setRepresentativeBirthPlace:'representativeBirthPlace',setTeachingCategories:'teachingCategories',setCandidateAccidentInsurance:'candidateAccidentInsurance',setAgencyWilaya:'agencyWilaya',setOwnerCommune:'ownerCommune',setOwnerDaira:'ownerDaira',setOwnerWilaya:'ownerWilaya',setProfessionalCommune:'professionalCommune',setProfessionalDaira:'professionalDaira',setProfessionalWilaya:'professionalWilaya',setPhone:'phone',setEmail:'email',setTechCommercialNo:'techCommercialNo',setTechCommercialDate:'techCommercialDate',setTechCommercialPlace:'techCommercialPlace',setTechCommercialAddress:'techCommercialAddress',setTechCommercialCommune:'techCommercialCommune',setTechLandline:'techLandline',setTechMobile:'techMobile',setTechPremisesType:'techPremisesType',setTechLeaseEnd:'techLeaseEnd',setTechSchoolNo:'techSchoolNo',setTechApprovalPlace:'techApprovalPlace'};Object.entries(map).forEach(([id,key])=>{if($(id))set(id,/phone|landline|mobile/i.test(id)?formatAlgerianPhone(db.settings[key]||'',id):db.settings[key]||'');});updateContractOwner();renderTechRows();}
function saveSchoolSettings(){db.settings ||= {};const map={setSchoolName:'schoolName',setOwnerName:'ownerName',setApprovalNo:'approvalNo',setApprovalDate:'approvalDate',setOwnerBirth:'ownerBirth',setOwnerBirthPlace:'ownerBirthPlace',setOwnerAddress:'ownerAddress',setProfessionalAddress:'professionalAddress',setOwnerRepresentative:'ownerRepresentative',setRepresentativeBirth:'representativeBirth',setRepresentativeBirthPlace:'representativeBirthPlace',setTeachingCategories:'teachingCategories',setCandidateAccidentInsurance:'candidateAccidentInsurance',setAgencyWilaya:'agencyWilaya',setOwnerCommune:'ownerCommune',setOwnerDaira:'ownerDaira',setOwnerWilaya:'ownerWilaya',setProfessionalCommune:'professionalCommune',setProfessionalDaira:'professionalDaira',setProfessionalWilaya:'professionalWilaya',setPhone:'phone',setEmail:'email',setTechCommercialNo:'techCommercialNo',setTechCommercialDate:'techCommercialDate',setTechCommercialPlace:'techCommercialPlace',setTechCommercialAddress:'techCommercialAddress',setTechCommercialCommune:'techCommercialCommune',setTechLandline:'techLandline',setTechMobile:'techMobile',setTechPremisesType:'techPremisesType',setTechLeaseEnd:'techLeaseEnd',setTechSchoolNo:'techSchoolNo',setTechApprovalPlace:'techApprovalPlace'};Object.entries(map).forEach(([id,key])=>{const value=val(id).trim();db.settings[key]=/phone|landline|mobile/i.test(id)?formatAlgerianPhone(value,id):value;});
 for(const id of ['setPhone','setTechMobile']){const v=db.settings[id==='setPhone'?'phone':'techMobile'];const valid=id==='setPhone'?isValidAlgerianContact(v):isValidAlgerianPhone(v);if(v&&!valid){alert('رقم الهاتف في الإعدادات غير صحيح: أدخل رقمًا محمولًا من 10 أرقام يبدأ بـ05 أو06 أو07، أو رقمًا ثابتًا من 9 أرقام.');$(id).focus();return;}}
 try{storage.setItem(KEY,JSON.stringify(db));updateContractOwner();if($('examWilayaPrint'))$('examWilayaPrint').textContent='لولاية '+String((db.settings||{}).agencyWilaya||'').trim();const formCandidate=candidate(val('formPrepCandidate'));if(formCandidate&&$('candidateFormPrint')?.children?.length)renderCandidateFormData(formCandidate);$('settingsStatus').textContent='تم حفظ إعدادات المدرسة والبطاقة التقنية بنجاح.';renderTechRows();}catch(e){alert('تعذر حفظ الإعدادات على هذا الجهاز.');}}
function updateContractOwner(){const s=db.settings||{};const put=(id,v)=>document.querySelectorAll('#contractPrint #'+id).forEach(el=>el.textContent=v||'');put('contractSchoolName',s.schoolName||'مدرسة تعليم السياقة');put('contractOwnerName',s.ownerName||'بلخيط بن يعقوب');put('contractSchoolLocation',[s.ownerCommune||s.commune||'بوقيرات',s.ownerWilaya||s.wilaya||'مستغانم'].filter(Boolean).join(' '));put('contractOwnerName2',s.ownerName);put('contractOwnerFull',s.ownerName);put('contractApprovalNo',s.approvalNo);put('contractApprovalDate',s.approvalDate?formatOfficialDate(s.approvalDate):'');put('contractOwnerBirth',s.ownerBirth?formatOfficialDate(s.ownerBirth):'');put('contractOwnerBirthPlace',s.ownerBirthPlace);put('contractOwnerAddress',s.ownerAddress);put('contractProfessionalAddress',s.professionalAddress);put('contractOwnerRepresentative',s.ownerRepresentative);put('contractRepresentativeBirth',s.representativeBirth?formatOfficialDate(s.representativeBirth):'');put('contractRepresentativeBirthPlace',s.representativeBirthPlace);put('contractTeachingCategories',s.teachingCategories);put('contractCandidateAccidentInsurance',s.candidateAccidentInsurance);put('contractProfessionalCommune',s.professionalCommune||s.commune);put('contractProfessionalDaira',s.professionalDaira||s.daira);put('contractProfessionalWilaya',s.professionalWilaya||s.wilaya);put('contractCommune',s.ownerCommune||s.commune);put('contractCommune2',s.ownerCommune||s.commune);put('contractDaira',s.ownerDaira||s.daira);put('contractWilaya',s.ownerWilaya||s.wilaya);put('contractWilaya2',s.ownerWilaya||s.wilaya);put('contractOwnerPhone',formatAlgerianPhone(s.phone||''));put('contractOwnerEmail',s.email);}


function renderTechRows(){
 const s=db.settings||{};const h=s.techHumans||[],v=s.techVehicles||[];
 const render=(arr,kind)=>arr.map((x,i)=>`<tr>${(kind==='human'?['name','classes','workEnd','insuranceEnd']:['category','registration','technicalEnd','insuranceEnd']).map((k,j)=>`<td><input aria-label="${k}" value="${esc(x[k]||'')}" onchange="updateTechRow('${kind}',${i},'${k}',this.value)" ${k.toLowerCase().includes('end')?'type="date"':''}></td>`).join('')}<td><button class="btn redbtn" type="button" onclick="removeTechRow('${kind}',${i})">حذف</button></td></tr>`).join('');
 $('techHumanRows').innerHTML=render(h,'human');$('techVehicleRows').innerHTML=render(v,'vehicle');
}
function updateTechRow(kind,i,key,value){db.settings ||= {};const arr=kind==='human'?(db.settings.techHumans||[]):(db.settings.techVehicles||[]);arr[i][key]=value;if(kind==='human')db.settings.techHumans=arr;else db.settings.techVehicles=arr;storage.setItem(KEY,JSON.stringify(db));}
function addTechHuman(){db.settings ||= {};db.settings.techHumans ||= [];db.settings.techHumans.push({name:'',classes:'',workEnd:'',insuranceEnd:''});renderTechRows();storage.setItem(KEY,JSON.stringify(db));}
function addTechVehicle(){db.settings ||= {};db.settings.techVehicles ||= [];db.settings.techVehicles.push({category:'',registration:'',technicalEnd:'',insuranceEnd:''});renderTechRows();storage.setItem(KEY,JSON.stringify(db));}
function removeTechRow(kind,i){const key=kind==='human'?'techHumans':'techVehicles';db.settings[key].splice(i,1);storage.setItem(KEY,JSON.stringify(db));renderTechRows();}
function techDate(v){return v?formatOfficialDate(v):'';}
function printTechnicalCard(){
 saveSchoolSettings();const s=db.settings||{},h=s.techHumans||[],v=s.techVehicles||[];
 const line=(label,value)=>`<div class="tc-line"><b>${label}:</b> ${esc(value||'')}</div>`;
 $('technicalCardPrint').innerHTML=`<div class="tc-head">الجمهورية الجزائرية الديمقراطية الشعبية<br>وزارة الداخلية والجماعات المحلية والتهيئة العمرانية<br>المندوبية الوطنية للأمن في الطرق<br>المندوبية الولائية للأمن في الطرق لولاية ${esc(s.agencyWilaya||'................')}</div><div class="tc-title">بطاقة تقنية لمدرسة تعليم السياقة</div>
 <div class="tc-fields">
 ${line('مدرسة تعليم السياقة',s.schoolName)}${line('رقم المدرسة',s.techSchoolNo)}
 ${line('اسم ولقب المستغل',s.ownerName)}${line('تاريخ الميلاد',techDate(s.ownerBirth))}
 ${line('اسم ولقب المسير',s.ownerRepresentative)}${line('تاريخ الميلاد',techDate(s.representativeBirth))}
 ${line('رقم الاعتماد',s.approvalNo)}${line('المؤرخ في',techDate(s.approvalDate)+' '+(s.techApprovalPlace||''))}
 ${line('رقم السجل التجاري',s.techCommercialNo)}${line('تاريخ السجل التجاري',techDate(s.techCommercialDate))}
 ${line('مكان السجل التجاري',s.techCommercialPlace)}${line('العنوان التجاري',s.techCommercialAddress)}
 ${line('البلدية',s.techCommercialCommune||s.ownerCommune)}${line('الهاتف الثابت',formatAlgerianPhone(s.techLandline||'','setTechLandline'))}
 ${line('الهاتف المحمول',formatAlgerianPhone(s.techMobile||s.phone||''))}${line('البريد الإلكتروني',s.email)}
 ${line('المحل التجاري',s.techPremisesType)}${line('تاريخ نهاية عقد الإيجار',techDate(s.techLeaseEnd))}
 </div><h3>الوسائل البشرية</h3><table class="tc-human-table"><colgroup><col style="width:21%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:21.5%"><col style="width:21.5%"></colgroup><thead><tr><th rowspan="2">اسم ولقب المعني</th><th colspan="4">الأصناف في شهادة الكفاءة المهنية</th><th rowspan="2">صلاحية عقد العمل</th><th rowspan="2">صلاحية عقد التأمين</th></tr><tr><th></th><th></th><th></th><th></th></tr></thead><tbody>${h.map(x=>{const cs=String(x.classes||'').split(/[,،;؛|/]+/).map(z=>z.trim()).filter(Boolean);return `<tr><td>${esc(x.name)}</td>${Array.from({length:4},(_,i)=>`<td>${esc(cs[i]||'')}</td>`).join('')}<td>${esc(techDate(x.workEnd))}</td><td>${esc(techDate(x.insuranceEnd))}</td></tr>`}).join('')}${Array.from({length:Math.max(0,5-h.length)},()=>'<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}</tbody></table>
 <h3>الوسائل المادية</h3><table><thead><tr><th>المركبة حسب الصنف</th><th>رقم التسجيل</th><th>صلاحية شهادة المراقبة التقنية</th><th>صلاحية شهادة التأمين</th></tr></thead><tbody>${v.map(x=>`<tr><td>${esc(x.category)}</td><td>${esc(x.registration)}</td><td>${esc(techDate(x.technicalEnd))}</td><td>${esc(techDate(x.insuranceEnd))}</td></tr>`).join('')}${Array.from({length:Math.max(0,4-v.length)},()=>'<tr><td></td><td></td><td></td><td></td></tr>').join('')}</tbody></table>`;
 document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
 $('technicalCardPrintPage').classList.add('active');
 window.scrollTo(0,0);
}
function confirmPrintTechnicalCard(){
 const page=$('technicalCardPrintPage');
 if(!page || !page.classList.contains('active')){printTechnicalCard();return;}
 page.classList.add('printing');
 window.print();
}
window.addEventListener('afterprint',function(){
 const page=$('technicalCardPrintPage');
 if(page) page.classList.remove('printing');
});

/* تهيئة مستقلة لكل جزء حتى لا يمنع خطأ واحد تشغيل بقية الواجهة */
try { normalizeStoredPhoneData(); setupPhoneInputs(); } catch(e) { console.error('phone setup failed:',e); }
try { loadSchoolSettings(); } catch(e) { console.error('loadSchoolSettings failed:',e); }
try { refresh(); } catch(e) { console.error('refresh failed:',e); }
try { toggleClassBFields(); } catch(e) { console.error('toggleClassBFields failed:',e); }
['payDate','expenseDate','callDate'].forEach(id=>{try{if($(id) && !$(id).value)$(id).value=new Date().toISOString().slice(0,10);}catch(e){console.error('date init failed:',id,e);}});
if(dbLoadWarning) console.warn('AutoEcole recovery notice:',dbLoadWarning);

// V2.16: live per-field language switching, including fields created after page load.
function smartScriptOf(text){
 const value=String(text||'');
 for(let i=value.length-1;i>=0;i--){
  const ch=value[i];
  if(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(ch)) return 'ar';
  if(/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch)) return 'fr';
 }
 return '';
}
function applySmartFieldLanguage(el, insertedText){
 if(!el || !(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
 if(el.tagName==='INPUT' && el.type && !['text','search','tel','email','url'].includes(el.type)) return;
 let script=smartScriptOf(insertedText);
 if(!script) script=smartScriptOf(el.value);
 if(!script) return;
 el.classList.add('smart-lang');
 el.classList.toggle('lang-ar',script==='ar');
 el.classList.toggle('lang-fr',script==='fr');
 el.setAttribute('lang',script);
 el.setAttribute('dir',script==='ar'?'rtl':'ltr');
 el.style.textAlign=script==='ar'?'right':'left';
}
// Initial fields
 document.querySelectorAll('input,textarea,select').forEach(el=>applySmartFieldLanguage(el));
// Delegation also covers modal fields and tabs rendered later by JavaScript.
 document.addEventListener('input',function(event){
  const el=event.target;
  if(!el || !el.matches || !el.matches('input,textarea,select')) return;
  applySmartFieldLanguage(el, typeof event.data==='string' ? event.data : '');
 },true);
 document.addEventListener('change',function(event){
  const el=event.target;
  if(el && el.matches && el.matches('input,textarea,select')) applySmartFieldLanguage(el);
 },true);

