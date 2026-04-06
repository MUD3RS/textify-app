var NAV_HIDDEN=['splash','login','register'];
var NAV_MAP={conv:'ni-conv',frases:'ni-frases',profile:'ni-profile'};
var SCREENS={splash:'s-splash',register:'s-register',login:'s-login',conv:'s-conv',frases:'s-frases',profile:'s-profile'};
var darkMode=false, modalAction='', ctxIdx=-1;

// Variables Globales de Estado
var conversations = [];
var nextId = 0, activeChatId = null;
var fData = ['Hola, buenos días. ¿En qué puedo ayudarte?','Necesito un momento para escribir mi respuesta.','No escucho bien, ¿puedes repetirlo más despacio?','Por favor escribe lo que me quieres decir.','Gracias, entendí perfectamente.'];

// ==========================================
// 1. FUNCIONES DE NAVEGACIÓN Y CARGA INICIAL
// ==========================================

function getBtns(){ return document.querySelectorAll('.screen-btn'); }

function go(name, btn) {
    closeDrawer(); closeCtx(); closeModal();
    
    // Si vamos a la pantalla de conversación o frases, aseguramos tener datos frescos
    if (name === 'conv') cargarConversaciones();
    if (name === 'frases') cargarFrasesDesdeBD();

    Object.values(SCREENS).forEach(function(id){ document.getElementById(id).classList.remove('active'); });
    document.getElementById(SCREENS[name]).classList.add('active');
    document.querySelectorAll('.screen-btn').forEach(function(b){ b.classList.remove('active'); });
    
    if(btn) btn.classList.add('active');
    document.getElementById('bnav').style.display=NAV_HIDDEN.includes(name)?'none':'flex';
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
    if(NAV_MAP[name]) document.getElementById(NAV_MAP[name]).classList.add('active');
    if(name==='sos'){ document.getElementById('sos-cv').style.display='flex'; document.getElementById('sos-sv').style.display='none'; }
    if(name==='frases') renderFrases();
    if(name==='profile') renderVoices();
    // Al ir a conv sin id específico → nueva conversación
    if(name==='conv' && activeChatId===null) startNewChat();
}

async function cargarConversaciones() {
    const userStr = localStorage.getItem('textify_user');
    if (!userStr) return;
    const usuario = JSON.parse(userStr);

    try {
        const response = await fetch(`/api/conversaciones/${usuario.id}`);
        const data = await response.json();
        if (response.ok) {
            conversations = data.conversaciones; 
            renderDrawerList(); 
        }
    } catch (error) { console.error("Error al cargar chats:", error); }
}

async function cargarFrasesDesdeBD() {
    const userStr = localStorage.getItem('textify_user');
    if (!userStr) return; 
    
    const usuario = JSON.parse(userStr);

    try {
        const response = await fetch(`/api/frases/${usuario.id}`);
        const data = await response.json();

        if (response.ok) {
            if (data.frases && data.frases.length > 0) {
                fData = data.frases;
                renderFrases(); 
            }
        }
    } catch (error) { console.error("Error al descargar frases:", error); }
}

// Carga inicial automática al abrir la app
document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('textify_user');
    if(userStr) {
        cargarConversaciones();
        cargarFrasesDesdeBD();
    }
});

// ==========================================
// 2. AUTENTICACIÓN (LOGIN Y REGISTRO)
// ==========================================

async function registrarUsuario() {
    const nombre = document.getElementById('reg-nombre').value;
    const apellido = document.getElementById('reg-apellido').value;
    const correo = document.getElementById('reg-correo').value;
    const pass = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;

    const tipoSeleccionado = document.querySelector('#s-register .type-opt.sel');
    const tipo_usuario = tipoSeleccionado.innerText.includes('sorda') ? 'sordo' : 'oyente';

    if(!nombre || !apellido || !correo || !pass) { alert("Por favor, llena todos los campos."); return; }
    if(pass !== pass2) { alert("Las contraseñas no coinciden."); return; }

    try {
        const response = await fetch('/api/registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, apellido: apellido, correo: correo, password: pass, tipo_usuario: tipo_usuario })
        });
        const data = await response.json();

        if (response.ok) {
            alert(data.mensaje); 
            document.getElementById('reg-nombre').value = '';
            document.getElementById('reg-apellido').value = '';
            document.getElementById('reg-correo').value = '';
            document.getElementById('reg-pass').value = '';
            document.getElementById('reg-pass2').value = '';
            go('login', getBtns()[2]); 
        } else {
            alert("Error: " + data.error);
        }
    } catch (error) { console.error("Error:", error); alert("Hubo un problema de conexión con el servidor."); }
}

async function iniciarSesion() {
    const correo = document.getElementById('log-correo').value;
    const pass = document.getElementById('log-pass').value;

    if (!correo || !pass) { alert("Por favor, ingresa tu correo y contraseña."); return; }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo: correo, password: pass })
        });
        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('textify_user', JSON.stringify(data.usuario));
            
            // Limpiamos los campos
            document.getElementById('log-correo').value = '';
            document.getElementById('log-pass').value = '';

            // APLICAMOS PREFERENCIAS
            if (data.usuario.configuraciones) {
                try {
                    const conf = JSON.parse(data.usuario.configuraciones);
                    if (conf.modoOscuro && !darkMode) togDark();
                    if (conf.generoVoz) selGenero(conf.generoVoz);
                    if (conf.vozActiva) selectedVoice = conf.vozActiva;
                } catch(e) { console.error("Error leyendo config:", e); }
            }
            
            // CARGAMOS DATOS Y NAVEGAMOS
            await cargarConversaciones(); 
            await cargarFrasesDesdeBD();
            go('conv', getBtns()[3]);
        } else {
            alert("Error: " + data.error);
        }
    } catch (error) { console.error("Error en login:", error); alert("Problema de conexión con el servidor."); }
}

// ==========================================
// 3. GESTIÓN DE CONVERSACIONES Y MENÚ LATERAL
// ==========================================

function startNewChat(){
    activeChatId=null;
    document.getElementById('chat-title').textContent='Textify';
    var area=document.getElementById('chat-area');
    area.innerHTML='<div id="msg-grabando" style="display:none;"><div class="msg-label">Oyente</div><div style="background:#ffffff;border-radius:12px 12px 12px 2px;padding:10px 14px;display:inline-flex;align-items:center;gap:4px;"><div class="wave-dot"></div><div class="wave-dot"></div><div class="wave-dot"></div></div></div>';
}

function openConv(id){
    var c=conversations.find(function(x){return x.id===id;});
    if(!c) return;
    activeChatId=id;
    document.getElementById('chat-title').textContent=c.titulo; // <-- CORREGIDO
    closeDrawer();
    var area=document.getElementById('chat-area');
    area.innerHTML=
      '<div><div class="msg-label">Oyente</div><div class="msg-oyente">'+(c.preview || 'Sin mensajes')+'<div class="msg-meta">🎙 audio → texto</div></div></div>'+
      '<div id="msg-grabando" style="display:none;"><div class="msg-label">Oyente</div><div style="background:#fff;border-radius:12px 12px 12px 2px;padding:10px 14px;display:inline-flex;align-items:center;gap:4px;"><div class="wave-dot"></div><div class="wave-dot"></div><div class="wave-dot"></div></div></div>';
    area.scrollTop=area.scrollHeight;
    go('conv', getBtns()[3]);
}

function openDrawer(){ renderDrawerList(); document.getElementById('drawer-backdrop').classList.add('open'); document.getElementById('drawer').classList.add('open'); }
function closeDrawer(){ document.getElementById('drawer-backdrop').classList.remove('open'); document.getElementById('drawer').classList.remove('open'); }

async function newChat() {
    const userStr = localStorage.getItem('textify_user');
    if (!userStr) return;
    const usuario = JSON.parse(userStr);

    try {
        const response = await fetch('/api/conversaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: usuario.id, titulo: 'Nueva conversación' })
        });
        const data = await response.json();

        if (response.ok) {
            activeChatId = data.id;
            document.getElementById('chat-title').textContent = data.titulo;
            closeDrawer();
            startNewChat();
            cargarConversaciones(); 
        }
    } catch (error) { console.error("Error al crear chat:", error); }
}

function renderDrawerList(){
    var list=document.getElementById('drawer-conv-list'); 
    list.innerHTML='';
    var sorted=conversations.slice().sort(function(a,b){ return (b.pinned?1:0)-(a.pinned?1:0); });

    sorted.forEach(function(c){
        var pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="#1F6AA5"><path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Z"/></svg>';
        var item=document.createElement('div');
        item.className='drawer-conv-item'+(c.pinned?' pinned':'');
        item.innerHTML=
          '<div class="dci-info">'+
            '<div class="dci-name" id="dcn-'+c.id+'">'+c.titulo+'</div>'+ // <-- CORREGIDO
            '<div class="dci-preview">'+(c.preview || 'Sin mensajes')+'</div>'+
          '</div>'+
          '<div class="dci-meta">'+
            (c.pinned?'<div class="dci-pin-icon">'+pinSvg+'</div>':'')+
            (c.time?'<div class="dci-time">'+c.time+'</div>':'')+
          '</div>';

        item.addEventListener('click',function(){ openConv(c.id); });
        
        var lpt=null;
        item.addEventListener('mousedown',function(e){ lpt=setTimeout(function(){ openCtx(e,c.id); },500); });
        item.addEventListener('mouseup',function(){ clearTimeout(lpt); });
        item.addEventListener('touchstart',function(e){ lpt=setTimeout(function(){ openCtx(e,c.id); },500); },{passive:true});
        item.addEventListener('touchend',function(){ clearTimeout(lpt); },{passive:true});
        item.addEventListener('contextmenu',function(e){ e.preventDefault(); openCtx(e,c.id); });

        list.appendChild(item);
    });
}

// --- MENÚ CONTEXTUAL ---
function openCtx(e,id){
    ctxIdx=id;
    var c=conversations.find(function(x){return x.id===id;});
    document.getElementById('ctx-pin-lbl').textContent=c&&c.pinned?'Desanclar':'Anclar';
    var menu=document.getElementById('ctx-menu');
    var phone=document.getElementById('phone');
    var pr=phone.getBoundingClientRect();
    var cx,cy;
    if(e.touches&&e.touches[0]){cx=e.touches[0].clientX-pr.left;cy=e.touches[0].clientY-pr.top;}
    else if(e.changedTouches&&e.changedTouches[0]){cx=e.changedTouches[0].clientX-pr.left;cy=e.changedTouches[0].clientY-pr.top;}
    else{cx=e.clientX-pr.left;cy=e.clientY-pr.top;}
    cx=Math.min(Math.max(cx,5),pr.width-165); cy=Math.min(Math.max(cy,5),pr.height-110);
    menu.style.left=cx+'px'; menu.style.top=cy+'px';
    menu.classList.add('show');
    setTimeout(function(){ document.addEventListener('click',closeCtxOutside); },10);
}
function closeCtx(){ document.getElementById('ctx-menu').classList.remove('show'); document.removeEventListener('click',closeCtxOutside); }
function closeCtxOutside(e){ if(!document.getElementById('ctx-menu').contains(e.target)) closeCtx(); }

async function ctxPin() {
    var c = conversations.find(function(x) { return x.id === ctxIdx; });
    if (!c) return;
    const nuevoEstado = !c.pinned;
    try {
        const response = await fetch('/api/conversaciones/' + ctxIdx, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinned: nuevoEstado })
        });
        if (response.ok) {
            c.pinned = nuevoEstado;
            closeCtx();
            renderDrawerList(); 
        }
    } catch (error) { console.error("Error al anclar:", error); }
}

function ctxRename() {
    closeCtx();
    var c = conversations.find(function(x) { return x.id === ctxIdx; });
    if (!c) return;

    var nameEl = document.getElementById('dcn-' + c.id);
    if (!nameEl) return;

    var inp = document.createElement('input');
    inp.className = 'conv-name-input';
    inp.value = c.titulo; // <-- CORREGIDO
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();

    async function finish() {
        const nuevoTitulo = inp.value.trim();
        if (nuevoTitulo && nuevoTitulo !== c.titulo) { // <-- CORREGIDO
            try {
                const response = await fetch('/api/conversaciones/' + c.id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo: nuevoTitulo })
                });
                if (response.ok) {
                    c.titulo = nuevoTitulo; // <-- CORREGIDO
                }
            } catch (e) { console.error("Error de red:", e); }
        }
        
        if (activeChatId === c.id) {
            document.getElementById('chat-title').textContent = c.titulo; // <-- CORREGIDO
        }
        renderDrawerList();
    }

    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', function(e) { 
        if (e.key === 'Enter') {
            e.preventDefault();
            inp.blur(); 
        }
    });
}

async function ctxDelete() {
    closeCtx();
    try {
        const response = await fetch('/api/conversaciones/' + ctxIdx, { method: 'DELETE' });
        if (response.ok) {
            conversations = conversations.filter(function(x) { return x.id !== ctxIdx; });
            if (activeChatId === ctxIdx) { activeChatId = null; startNewChat(); }
            renderDrawerList();
        }
    } catch (e) { console.error("Error al eliminar:", e); }
}

// ==========================================
// 4. CHAT Y MENSAJES (FRONTEND)
// ==========================================

var oyFrases=['Hola, ¿cómo te llamas?','¿A qué te dedicas?','No hay problema.','¿Necesitas algo más?','¿Puedes repetirlo?','Entendido.'];
var oyIdx=0, recInterval=null, recSecs=0;
setTimeout(function(){ var f=document.getElementById('chat-field'); if(f) f.addEventListener('input',onInput); },100);
function getFieldText(){ var f=document.getElementById('chat-field'); return f?f.innerText.trim():''; }
var SVG_SEND='<svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="#fff"><path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z"/></svg>';
var SVG_MIC='<svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="#fff"><path d="M395-435q-35-35-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35q-50 0-85-35Zm85-205Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm68.5-371.5Q520-503 520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480q17 0 28.5-11.5Z"/></svg>';
function onInput(){ var btn=document.getElementById('action-btn'); if(btn) btn.innerHTML=getFieldText().length>0?SVG_SEND:SVG_MIC; }
function accionBtn(){ if(getFieldText().length>0) enviarMensaje(); else iniciarGrabacion(); }

async function enviarMensaje() {
    var f = document.getElementById('chat-field');
    var txt = f.innerText.trim();
    if (!txt || activeChatId === null) { if (activeChatId === null) alert("Abre el menú (☰) y crea una conversación primero."); return; }

    f.innerText = ''; onInput();
    var area = document.getElementById('chat-area');
    var w = document.createElement('div');
    w.style.cssText = 'align-self:flex-end;max-width:80%;';
    w.innerHTML = '<div class="msg-sordo">' + txt + '<div class="msg-meta">🔊 texto → voz · ahora</div></div>';
    area.insertBefore(w, document.getElementById('msg-grabando'));
    area.scrollTop = area.scrollHeight;

    try {
        await fetch('/api/mensajes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversacion_id: activeChatId, remitente: 'usuario_app', texto: txt, tipo_input: 'texto_a_voz' })
        });
        cargarConversaciones(); 
    } catch (error) { console.error("Error al guardar mensaje:", error); }

    setTimeout(simularOyente, 2000);
}

function iniciarGrabacion(){
    document.getElementById('chat-input-bar').style.display='none'; document.getElementById('rec-bar').style.display='flex'; document.getElementById('msg-grabando').style.display='block';
    var area=document.getElementById('chat-area'); area.scrollTop=area.scrollHeight; recSecs=0; document.getElementById('rec-timer').textContent='0:00';
    recInterval=setInterval(function(){ recSecs++; var m=Math.floor(recSecs/60),s=recSecs%60; document.getElementById('rec-timer').textContent=m+':'+(s<10?'0':'')+s; },1000);
    setTimeout(function(){ if(document.getElementById('rec-bar').style.display!=='none') enviarGrabacion(); },2500);
}
function cancelarGrabacion(){ clearInterval(recInterval); document.getElementById('chat-input-bar').style.display='flex'; document.getElementById('rec-bar').style.display='none'; document.getElementById('msg-grabando').style.display='none'; }
function enviarGrabacion(){
    clearInterval(recInterval); document.getElementById('chat-input-bar').style.display='flex'; document.getElementById('rec-bar').style.display='none'; document.getElementById('msg-grabando').style.display='none';
    oyIdx=(oyIdx+1)%oyFrases.length;
    var area=document.getElementById('chat-area'); var w=document.createElement('div');
    w.innerHTML='<div class="msg-label">Oyente</div><div class="msg-oyente">'+oyFrases[oyIdx]+'<div class="msg-meta">🎙 audio → texto · ahora</div></div>';
    area.insertBefore(w,document.getElementById('msg-grabando')); area.scrollTop=area.scrollHeight;
    if(activeChatId!==null){ var c=conversations.find(function(x){return x.id===activeChatId;}); if(c){c.preview=oyFrases[oyIdx].substring(0,40);c.time='Ahora';} }
}
function simularOyente(){
    oyIdx=(oyIdx+1)%oyFrases.length;
    var area=document.getElementById('chat-area'); var w=document.createElement('div');
    w.innerHTML='<div class="msg-label">Oyente</div><div class="msg-oyente">'+oyFrases[oyIdx]+'<div class="msg-meta">🎙 audio → texto · ahora</div></div>';
    area.insertBefore(w,document.getElementById('msg-grabando')); area.scrollTop=area.scrollHeight;
}

// ==========================================
// 5. FRASES RÁPIDAS
// ==========================================

var selMode=false,selSet=new Set(),ptmr=null,swCard=null;
function renderFrases(){
    var list=document.getElementById('f-list'); list.innerHTML='';
    var q=(document.getElementById('s-inp').value||'').toLowerCase(); var vis=0;
    fData.forEach(function(f,i){
        if(q&&f.toLowerCase().indexOf(q)===-1) return; vis++;
        var wrap=document.createElement('div'); wrap.className='f-wrap';
        var bg=document.createElement('div'); bg.className='f-bg'; bg.innerHTML='<span>🗑 Borrar</span>';
        var card=document.createElement('div'); card.className='f-card'+(selSet.has(i)?' selected':'');
        var chk=document.createElement('div'); chk.className='f-chk'+(selMode?' show':'')+(selSet.has(i)?' on':''); chk.textContent=selSet.has(i)?'✓':'';
        var txt=document.createElement('div'); txt.className='f-txt'; txt.textContent=f;
        var pl=document.createElement('button'); pl.className='f-play';
        pl.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#0B3C5D"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>';
        
        pl.onclick=function(e){ e.stopPropagation(); if(selMode) return; playFrase(card,f); };
        card.appendChild(chk); card.appendChild(txt); card.appendChild(pl);
        card.onclick=function(){ if(selMode) togSel(i,card,chk); };
        var sX=0,cX=0,drag=false;
        function onS(e){ if(selMode) return; if(swCard&&swCard!==card){swCard.classList.remove('swiped');swCard.style.transform='';swCard=null;} sX=e.touches?e.touches[0].clientX:e.clientX; drag=true; }
        function onM(e){ if(!drag) return; cX=(e.touches?e.touches[0].clientX:e.clientX)-sX; if(cX<0) card.style.transform='translateX('+Math.max(cX,-76)+'px)'; else if(card.classList.contains('swiped')) card.style.transform='translateX('+Math.min(-76+cX,0)+'px)'; }
        function onE(){ if(!drag) return; drag=false; if(cX<-38){card.classList.add('swiped');card.style.transform='translateX(-68px)';swCard=card;enterSel(i);} else if(cX>20&&card.classList.contains('swiped')){card.classList.remove('swiped');card.style.transform='';swCard=null;} else card.style.transform=card.classList.contains('swiped')?'translateX(-68px)':''; cX=0; }
        card.addEventListener('mousedown',onS); card.addEventListener('touchstart',onS,{passive:true});
        document.addEventListener('mousemove',onM); document.addEventListener('mouseup',onE);
        card.addEventListener('touchmove',onM,{passive:true}); card.addEventListener('touchend',onE);
        wrap.appendChild(bg); wrap.appendChild(card); list.appendChild(wrap);
    });
    document.getElementById('no-res').style.display=vis===0?'block':'none';
    var fc=document.getElementById('f-count'); if(fc) fc.textContent=fData.length+(fData.length===1?' frase':' frases');
}

async function addFrase() {
    var inp = document.getElementById('new-f');
    var val = inp.value.trim();
    if (!val) return;

    const userStr = localStorage.getItem('textify_user');
    if (!userStr) { alert("Debes iniciar sesión para guardar frases seguras."); return; }
    const usuario = JSON.parse(userStr);

    try {
        const response = await fetch('/api/frases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: usuario.id, texto: val })
        });
        const data = await response.json();

        if (response.ok) {
            fData.push(val);
            inp.value = '';
            renderFrases();
        } else { alert("Error al guardar: " + data.error); }
    } catch (error) { console.error("Error en la petición:", error); }
}

function enterSel(i){selMode=true;document.getElementById('fh-n').style.display='none';document.getElementById('fh-s').style.display='flex';document.getElementById('hint-strip').style.display='none';selSet.add(i);renderFrases();updSel();}
function cancelSel(){selMode=false;selSet.clear();swCard=null;document.getElementById('fh-n').style.display='block';document.getElementById('fh-s').style.display='none';document.getElementById('hint-strip').style.display='block';renderFrases();}
function togSel(i,card,chk){if(selSet.has(i)){selSet.delete(i);card.classList.remove('selected');chk.classList.remove('on');chk.textContent='';}else{selSet.add(i);card.classList.add('selected');chk.classList.add('on');chk.textContent='✓';}updSel();}
function selAll(){if(selSet.size===fData.length){selSet.clear();}else{fData.forEach(function(_,i){selSet.add(i);});}renderFrases();updSel();}
function delSel(){if(!selSet.size) return;Array.from(selSet).sort(function(a,b){return b-a;}).forEach(function(i){fData.splice(i,1);});cancelSel();}
function updSel(){var n=selSet.size;document.getElementById('s-cnt').textContent=n===0?'Ninguna':n+(n===1?' seleccionada':' seleccionadas');var b=document.getElementById('del-btn');b.disabled=n===0;b.textContent=n>0?'Borrar ('+n+')':'Borrar';}
function filtrar(inp){document.getElementById('s-clr').style.display=inp.value?'block':'none';renderFrases();}
function clrSearch(){document.getElementById('s-inp').value='';document.getElementById('s-clr').style.display='none';renderFrases();}
function playFrase(card,f){document.querySelectorAll('.f-card').forEach(function(c){c.classList.remove('playing');});card.classList.add('playing');var s=document.getElementById('tts-strip');s.style.display='flex';document.getElementById('tts-txt').textContent='Reproduciendo: "'+f.substring(0,28)+(f.length>28?'...':'"');if(ptmr)clearTimeout(ptmr);ptmr=setTimeout(function(){card.classList.remove('playing');s.style.display='none';},2500);}

// ==========================================
// 6. PERFIL, CONFIGURACIÓN Y UI
// ==========================================

function selType(el){ el.closest('.type-sel').querySelectorAll('.type-opt').forEach(function(o){o.classList.remove('sel');}); el.classList.add('sel'); }
function togChk(id){ var e=document.getElementById(id); e.classList.toggle('on'); e.textContent=e.classList.contains('on')?'✓':''; }
function togThis(t){ t.classList.toggle('on'); }
function selSeg(el){ el.closest('.seg-row').querySelectorAll('.seg-opt').forEach(function(o){o.classList.remove('sel');}); el.classList.add('sel'); }

/* VOCES */
var voiceData={
    fem:[{name:'Sofía',desc:'Voz suave y cálida'},{name:'Valentina',desc:'Voz clara y natural'},{name:'Camila',desc:'Voz expresiva y amigable'}],
    mas:[{name:'Alejandro',desc:'Voz grave y firme'},{name:'Diego',desc:'Voz clara y profesional'},{name:'Mateo',desc:'Voz amigable y cercana'}]
};
var selectedGenero='fem', selectedVoice='Sofía';
function selGenero(g){ selectedGenero=g; document.getElementById('vg-fem').classList.toggle('sel',g==='fem'); document.getElementById('vg-mas').classList.toggle('sel',g==='mas'); renderVoices(); guardarPreferencias(); }
function renderVoices(){
    var list=document.getElementById('voice-list'); if(!list) return; list.innerHTML='';
    voiceData[selectedGenero].forEach(function(v){
        var card=document.createElement('div'); card.className='voice-card'+(v.name===selectedVoice?' sel':'');
        var avatarBg=selectedGenero==='fem'?'#1a5276':'#1a3d5c';
        var initials=v.name.charAt(0);
        card.innerHTML='<div class="voice-avatar" style="background:'+avatarBg+';color:#fff;font-size:13px;font-weight:600;">'+initials+'</div><div class="voice-info"><div class="voice-name">'+v.name+'</div><div class="voice-desc">'+v.desc+'</div></div><button class="voice-play" onclick="event.stopPropagation()"><svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#FFFFFF"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg></button>';
        card.onclick=function(){ selectedVoice=v.name; renderVoices(); guardarPreferencias(); };
        list.appendChild(card);
    });
}

/* MODO OSCURO */
function togDark(){
    var tog=document.getElementById('tog-dark'); darkMode=!darkMode; tog.classList.toggle('on',darkMode);
    var p=document.getElementById('phone');
    if(darkMode){
        p.style.background='#0d1520';
        p.style.setProperty('--bn-bg','#111d2b'); p.style.setProperty('--bn-border','#1e3248'); p.style.setProperty('--nav-inactive','#5a8ab0'); p.style.setProperty('--form-bg','#0d1520'); p.style.setProperty('--prof-bg','#0d1520'); p.style.setProperty('--card-bg','#111d2b'); p.style.setProperty('--card-border','#1e3248'); p.style.setProperty('--text-main','#c8e0f4'); p.style.setProperty('--row-border','#1e3248'); p.style.setProperty('--seg-bg','#0d1520'); p.style.setProperty('--pin-bg','#0f2030'); p.style.setProperty('--item-active','#162233'); p.style.setProperty('--drawer-bg','#111d2b'); p.style.setProperty('--chat-area-bg','#0d1520'); p.style.setProperty('--msg-oy-bg','#111d2b'); p.style.setProperty('--msg-oy-color','#c8e0f4'); p.style.setProperty('--msg-label-color','#5a8ab0'); p.style.setProperty('--chat-field-bg','#111d2b'); p.style.setProperty('--chat-field-color','#c8e0f4'); p.style.setProperty('--chat-field-border','#1e3248'); p.style.setProperty('--f-card-bg','#111d2b'); p.style.setProperty('--f-card-border','#1e3248'); p.style.setProperty('--f-txt-color','#c8e0f4'); p.style.setProperty('--f-add-bg','#111d2b'); p.style.setProperty('--f-input-bg','#0d1520'); p.style.setProperty('--f-input-color','#c8e0f4'); p.style.setProperty('--hint-bg','#0f1e2d'); p.style.setProperty('--hint-color','#5a8ab0'); p.style.setProperty('--fi-bg','#111d2b'); p.style.setProperty('--fi-color','#c8e0f4'); p.style.setProperty('--fi-border','#1e3248'); p.style.setProperty('--fh-color','#c8e0f4'); p.style.setProperty('--fp-color','#5a8ab0'); p.style.setProperty('--fl-color','#5a9fd4'); p.style.setProperty('--modal-bg','#111d2b'); p.style.setProperty('--modal-title-color','#c8e0f4'); p.style.setProperty('--modal-body-color','#7aaac8'); p.style.setProperty('--modal-cancel-bg','#0d1520'); p.style.setProperty('--modal-cancel-color','#7aaac8'); p.style.setProperty('--ctx-menu-bg','#111d2b'); p.style.setProperty('--ctx-item-color','#c8e0f4'); p.style.setProperty('--ctx-item-border','#1e3248'); p.style.setProperty('--ctx-hover-bg','#162233'); p.style.setProperty('--logout-btn-bg','#111d2b'); p.style.setProperty('--logout-btn-color','#c8e0f4'); p.style.setProperty('--logout-btn-border','#1e3248'); p.style.setProperty('--lang-b-bg','#0f2030'); p.style.setProperty('--lang-b-color','#6FA8DC'); p.style.setProperty('--link-color','#6FA8DC'); p.style.setProperty('--or-color','#3a5570'); p.style.setProperty('--div-or-line','#1e3248'); p.style.setProperty('--chk-lbl-color','#7aaac8'); p.style.setProperty('--no-res-color','#3a5570'); p.style.setProperty('--tts-strip-bg','#0a2a1a'); p.style.setProperty('--tts-strip-color','#2ECC71'); p.style.setProperty('--drawer-new-bg','#0f2030'); p.style.setProperty('--drawer-new-lbl','#c8e0f4'); p.style.setProperty('--drawer-section-color','#5a8ab0'); p.style.setProperty('--dci-preview-color','#3a5570'); p.style.setProperty('--dci-time-color','#3a5570'); p.style.setProperty('--dci-pin-color','#5a9fd4'); p.style.setProperty('--s-gtitle-color','#5a9fd4'); p.style.setProperty('--type-opt-bg','#111d2b'); p.style.setProperty('--type-opt-color','#5a8ab0'); p.style.setProperty('--type-opt-border','#1e3248'); p.style.setProperty('--voice-card-bg','#111d2b'); p.style.setProperty('--vg-btn-color','#5a8ab0'); p.style.setProperty('--voice-desc-color','#5a8ab0'); p.style.setProperty('--nav-active-color','#6FA8DC'); p.style.setProperty('--nav-dot-color','#6FA8DC');
    } else {
        p.style.background='#F5F9FC';
        p.style.setProperty('--bn-bg','#fff'); p.style.setProperty('--bn-border','#e0ecf8'); p.style.setProperty('--nav-inactive','#aaa'); p.style.setProperty('--form-bg','#F5F9FC'); p.style.setProperty('--prof-bg','#F5F9FC'); p.style.setProperty('--card-bg','#fff'); p.style.setProperty('--card-border','#e0ecf8'); p.style.setProperty('--text-main','#333'); p.style.setProperty('--row-border','#f0f0f0'); p.style.setProperty('--seg-bg','#f0f4f8'); p.style.setProperty('--pin-bg','#f0f8ff'); p.style.setProperty('--item-active','#e8f2fb'); p.style.setProperty('--drawer-bg','#fff'); p.style.setProperty('--chat-area-bg','#ECF0F1'); p.style.setProperty('--msg-oy-bg','#fff'); p.style.setProperty('--msg-oy-color','#0B3C5D'); p.style.setProperty('--msg-label-color','#888'); p.style.setProperty('--chat-field-bg','#F5F9FC'); p.style.setProperty('--chat-field-color','#0B3C5D'); p.style.setProperty('--chat-field-border','#dde'); p.style.setProperty('--f-card-bg','#fff'); p.style.setProperty('--f-card-border','#e0ecf8'); p.style.setProperty('--f-txt-color','#0B3C5D'); p.style.setProperty('--f-add-bg','#fff'); p.style.setProperty('--f-input-bg','#F5F9FC'); p.style.setProperty('--f-input-color','#0B3C5D'); p.style.setProperty('--hint-bg','#e8f2fb'); p.style.setProperty('--hint-color','#1F6AA5'); p.style.setProperty('--fi-bg','#fff'); p.style.setProperty('--fi-color','#0B3C5D'); p.style.setProperty('--fi-border','#6FA8DC'); p.style.setProperty('--fh-color','#0B3C5D'); p.style.setProperty('--fp-color','#888'); p.style.setProperty('--fl-color','#1F6AA5'); p.style.setProperty('--modal-bg','#fff'); p.style.setProperty('--modal-title-color','#0B3C5D'); p.style.setProperty('--modal-body-color','#555'); p.style.setProperty('--modal-cancel-bg','#f0f4f8'); p.style.setProperty('--modal-cancel-color','#555'); p.style.setProperty('--ctx-menu-bg','#fff'); p.style.setProperty('--ctx-item-color','#0B3C5D'); p.style.setProperty('--ctx-item-border','#f0f0f0'); p.style.setProperty('--ctx-hover-bg','#f0f8ff'); p.style.setProperty('--logout-btn-bg','#f5f9fc'); p.style.setProperty('--logout-btn-color','#0B3C5D'); p.style.setProperty('--logout-btn-border','#6FA8DC'); p.style.setProperty('--lang-b-bg','#e8f2fb'); p.style.setProperty('--lang-b-color','#0B3C5D'); p.style.setProperty('--link-color','#1F6AA5'); p.style.setProperty('--or-color','#aaa'); p.style.setProperty('--div-or-line','#dde'); p.style.setProperty('--chk-lbl-color','#555'); p.style.setProperty('--no-res-color','#aaa'); p.style.setProperty('--tts-strip-bg','#d5f5e3'); p.style.setProperty('--tts-strip-color','#196f3d'); p.style.setProperty('--drawer-new-bg','#e8f2fb'); p.style.setProperty('--drawer-new-lbl','#0B3C5D'); p.style.setProperty('--drawer-section-color','#1F6AA5'); p.style.setProperty('--dci-preview-color','#aaa'); p.style.setProperty('--dci-time-color','#bbb'); p.style.setProperty('--dci-pin-color','#1F6AA5'); p.style.setProperty('--s-gtitle-color','#1F6AA5'); p.style.setProperty('--type-opt-bg','#fff'); p.style.setProperty('--type-opt-color','#888'); p.style.setProperty('--type-opt-border','#dde'); p.style.setProperty('--voice-card-bg','#f0f4f8'); p.style.setProperty('--vg-btn-color','#888'); p.style.setProperty('--voice-desc-color','#888'); p.style.setProperty('--nav-active-color','#0B3C5D'); p.style.setProperty('--nav-dot-color','#0B3C5D');
    }
    guardarPreferencias();
}

async function guardarPreferencias() {
    const userStr = localStorage.getItem('textify_user');
    if (!userStr) return;
    const usuario = JSON.parse(userStr);

    const config = { modoOscuro: darkMode, generoVoz: selectedGenero, vozActiva: selectedVoice };

    try {
        await fetch(`/api/usuarios/${usuario.id}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        usuario.configuraciones = JSON.stringify(config);
        localStorage.setItem('textify_user', JSON.stringify(usuario));
    } catch (e) { console.error("Error al guardar preferencias:", e); }
}

/* MODAL */
function showModal(action){
    modalAction=action;
    var icon=document.getElementById('modal-icon'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body'),confirm=document.getElementById('modal-confirm');
    if(action==='logout'){
        icon.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#1F6AA5"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z"/></svg>';
        title.textContent='¿Cerrar sesión?';body.textContent='Tu historial local se conservará en este dispositivo.';confirm.textContent='Sí, cerrar sesión';confirm.className='modal-confirm amber';
    } else {
        icon.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#e74c3c"><path d="m376-300 104-104 104 104 56-56-104-104 104-104-56-56-104 104-104-104-56 56 104 104-104 104 56 56Zm-96 180q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z"/></svg>';
        title.textContent='¿Eliminar cuenta?';body.textContent='Esta acción es permanente. Se eliminarán todos tus datos. No se puede deshacer.';confirm.textContent='Sí, eliminar mi cuenta';confirm.className='modal-confirm red';
    }
    document.getElementById('modal-overlay').classList.add('show');
}
function closeModal(){ document.getElementById('modal-overlay').classList.remove('show'); }
function confirmModal(){ 
    closeModal(); 
    if (modalAction === 'logout') {
        localStorage.removeItem('textify_user');
        conversations = [];
        go('splash',getBtns()[0]); 
    }
}