(function () {
  'use strict';
  const API = 'https://sai-da-frente-lobby.limasantoslucas6.chatgpt.site/api/rooms';
  const KEY = 'sai-da-frente-room-v1';
  const $ = id => document.getElementById(id);
  let session = null, snapshot = null, hooks = {}, timer = null, tick = null;
  let anchor = 0, anchorTime = 0, lastResponse = 0, launched = null, queue = Promise.resolve();
  let pending = 0, submitting = false, terminal = false;
  try { session = JSON.parse(sessionStorage.getItem(KEY));
    if (!session || !/^[a-f0-9]{64}$/.test(session.token) || (session.room && !/^[A-HJ-NP-Z2-9]{8}$/.test(session.room))) session = null;
  } catch (_) { session = null; }
  const now = () => anchor + (performance.now() - anchorTime);
  function persist() { try { if (session) sessionStorage.setItem(KEY,JSON.stringify(session)); else sessionStorage.removeItem(KEY); } catch (_) { /* Session can still play without storage. */ } }
  const message = text => { $('roomMessage').textContent = text; };
  const name = () => window.RushCompetition.nickname($('nickname').value);
  function newSession(room) {
    session = { room, token: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('') };
    snapshot = null; launched = null; terminal = false; persist(); render(); hooks.change?.();
  }
  async function request(action, fields = {}) {
    if (!session || terminal) return null;
    const current = session;
    const execute = async () => {
      if (session !== current) return null;
      pending++;
      const start = performance.now();
      try {
        const response = await fetch(API, { method:'POST', cache:'no-store', credentials:'omit',
          headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(8000),
          body:JSON.stringify({ action,room:current.room,token:current.token,stage:hooks.stage?.() || 0,...fields }) });
        const data = await response.json();
        if (!response.ok) { const error = new Error(data.error || 'Não foi possível atualizar a sala.'); error.status = response.status; throw error; }
        if (session !== current) return null;
        if (data.left) return data;
        current.room = data.room.code; snapshot = data;
        anchor = data.now + (performance.now() - start)/2; anchorTime = performance.now(); lastResponse = anchorTime;
        persist(); updateURL();
        message(''); render(); hooks.change?.(); checkStart();
        if (current.result && !data.players.find(p=>p.id===data.selfId)?.score && !submitting) {
          setTimeout(()=>submit(current.result),0);
        }
        return data;
      } catch (error) {
        if (session !== current) return null;
        if ([403,410].includes(error.status)) { terminal = true; clearTimeout(timer); message(error.message); }
        else message(error.status ? error.message : 'Conexão interrompida. Tentando reconectar… A partida continua contando o tempo.');
        render(); throw error;
      } finally { pending--; }
    };
    const task = queue.then(execute,execute);
    queue = task.catch(()=>{});
    return task;
  }
  function poll() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!session || terminal) return;
      try { if (!pending) await request(snapshot ? 'poll' : (session.room ? 'join':'create'),{name:name()}); } catch (_) {}
      poll();
    },2000);
  }
  function updateURL() {
    if (!session?.room) return;
    history.replaceState(null,'',location.pathname+location.search+'#'+new URLSearchParams({sala:session.room}).toString());
  }
  async function create() {
    if (session) return;
    newSession(null); message('Criando a sala…');
    try { await request('create',{name:name()}); } catch (_) {}
    poll();
  }
  async function join(code) {
    if (session) return;
    const room=String(code||'').trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room)) { $('roomJoinError').textContent='Digite os 8 caracteres do código.'; return; }
    $('roomJoinError').textContent=''; newSession(room);message('Entrando na sala…');
    try { await request('join',{name:name()}); } catch (_) {}
    poll();
  }
  async function leave() {
    const wasTerminal=terminal;
    clearTimeout(timer);
    if (!wasTerminal) { try { await request('leave'); } catch (_) {} }
    session=null;snapshot=null;launched=null;terminal=false;persist();render();hooks.leave?.();
  }
  function checkStart() {
    if (!session || terminal || !snapshot || snapshot.room.status!=='started') return;
    const self=snapshot.players.find(p=>p.id===snapshot.selfId);
    if (!self || self.left || self.score || session.result) return;
    const key=session.room+':'+snapshot.room.startsAt;
    if (launched===key) return;
    const remaining=snapshot.room.startsAt-now();
    if (remaining>0) {
      $('roomCountdown').hidden=false;
      $('roomCountdown').textContent=`Largada em ${Math.ceil(remaining/1000)}…`;
    } else if (performance.now()-lastResponse<6000) {
      launched=key;$('roomCountdown').hidden=true;
      hooks.start?.(snapshot, session.checkpoint || null);
    } else {
      $('roomCountdown').hidden=false;$('roomCountdown').textContent='Reconectando para confirmar a largada…';
    }
  }
  function render() {
    $('roomPanel').hidden=!session;
    if (!session) return;
    $('roomCode').textContent=session.room || '…';
    $('roomCopyButton').disabled=!session.room;
    const waiting=snapshot?.room.status==='waiting';
    const self=snapshot?.players.find(p=>p.id===snapshot.selfId);
    const host=self && snapshot.room.hostId===self.id;
    const fresh=performance.now()-lastResponse<20000 && !terminal;
    $('roomStatus').textContent=!snapshot?'Conectando…':terminal?'Sala indisponível':!fresh?'Reconectando…':waiting?'Esperando a turma':now()<snapshot.room.startsAt?'Prepare-se para a largada':'Racha em andamento';
    $('roomReadyButton').hidden=!waiting || terminal;
    $('roomReadyButton').textContent=self?.ready?'Pronto ✓ (desmarcar)':'Estou pronto';
    $('roomReadyButton').setAttribute('aria-pressed',String(!!self?.ready));
    $('roomStartButton').hidden=!host || !waiting || terminal;
    $('roomStartButton').disabled=!fresh || !snapshot || snapshot.players.length<2 || !snapshot.players.every(p=>p.ready&&p.online&&!p.left);
    $('roomHelp').textContent=waiting ? (host ? 'Dê a largada quando todos estiverem online e prontos. De 2 a 8 jogadores.' : 'Marque Pronto. O anfitrião dará a largada para todos.') : 'Menos movimentos vence. O tempo é contínuo desde a largada, inclusive entre etapas.';
    const people=$('roomPlayers');people.replaceChildren();
    const players=snapshot ? [...snapshot.players].sort((a,b)=>a.score&&b.score?window.RushCompetition.compare(a.score,b.score):a.score?-1:b.score?1:0) : [];
    for(const player of players) {
      const row=document.createElement('li');row.className='room-player';
      const label=document.createElement('span');label.textContent=player.name+(player.id===snapshot.room.hostId?' · anfitrião':'')+(player.id===snapshot.selfId?' · você':'');
      const status=document.createElement('strong');
      status.className=player.online&&fresh?'online':'offline';
      status.textContent=player.score?`${player.score.m} mov. · ${window.RushCompetition.formatTime(player.score.t)}`:
        player.left?'Saiu':!fresh?'Conexão incerta':!player.online?'Desconectado':waiting?(player.ready?'Pronto ✓':'Entrou · preparando'):now()<snapshot.room.startsAt?'Na largada':`Jogando · etapa ${Math.min(3,player.stage+1)}`;
      row.append(label,status);
      if(host&&waiting&&player.id!==self.id) {
        const remove=document.createElement('button');remove.className='room-remove';remove.textContent='Remover';remove.setAttribute('aria-label',`Remover ${player.name}`);
        remove.addEventListener('click',()=>request('remove',{player:player.id}).catch(()=>{}));row.append(remove);
      }
      people.append(row);
    }
    if (self?.score) { $('roomCountdown').hidden=false; $('roomCountdown').textContent='Sua marca está no placar. Aguarde os amigos terminarem!'; }
    else if (!snapshot || waiting || terminal) $('roomCountdown').hidden=true;
  }
  async function copy() {
    if (!session?.room) return;
    const url=location.origin+location.pathname+'#'+new URLSearchParams({sala:session.room}).toString();
    $('roomInviteLink').value=url;$('roomLinkBox').hidden=false;
    try { await navigator.clipboard.writeText(url);message('Convite copiado! Envie para a turma.'); }
    catch (_) { $('roomInviteLink').focus();$('roomInviteLink').select();message('Copie o link para convidar seus amigos.'); }
  }
  async function submit(result) {
    if (!session || submitting || terminal || snapshot?.players.find(p=>p.id===snapshot.selfId)?.score) return;
    session.result=result;persist();submitting=true;message('Enviando seu resultado…');
    try { await request('finish',{result}); } catch (_) {} finally { submitting=false; }
  }
  window.RushRoom={
    get active(){return !!session;}, get state(){return snapshot;}, get unavailable(){return terminal;},
    elapsed(){return snapshot?.room.startsAt?Math.max(0,now()-snapshot.room.startsAt):0;},
    save(checkpoint){if(session){session.checkpoint=checkpoint;persist();}}, finish:submit,
    attach(callbacks){
      hooks=callbacks;
      $('inviteButton').addEventListener('click',create);
      $('joinRoomButton').addEventListener('click',()=>join($('roomCodeInput').value));
      $('roomReadyButton').addEventListener('click',()=>request('ready',{ready:!snapshot?.players.find(p=>p.id===snapshot.selfId)?.ready}).catch(()=>{}));
      $('roomStartButton').addEventListener('click',()=>request('start').catch(()=>{}));
      $('roomExitButton').addEventListener('click',leave);
      $('roomCopyButton').addEventListener('click',copy);
      const invite=new URLSearchParams(location.hash.slice(1)).get('sala');
      if(session && invite && invite!==session.room) { session=null;snapshot=null;persist(); }
      if(session){message('Reconectando à sua sala…');request(session.room?'poll':'create',{name:name()}).catch(()=>{});poll();}
      else if(invite){$('roomCodeInput').value=invite;$('roomJoinError').textContent='Você recebeu um convite. Escolha seu apelido e clique em Entrar na sala.';}
      render();hooks.change?.();
      clearInterval(tick);tick=setInterval(()=>{if(session){checkStart();if(snapshot&&performance.now()-lastResponse>20000)render();}},200);
    },
  };
})();
