const $ = (id) => document.getElementById(id);
let auth, db, authAPI, dbAPI;
let user = null, tasks = [], stopListening = null, session = 0;
let signup = false, authBusy = false, busy = false, ready = false, filter = 'all', editingId = null;
$('today').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

function notify(text = '', error = false, target = 'message') {
  const box = $(target);
  box.textContent = text; box.hidden = !text;
  box.classList.toggle('error', error);
  box.setAttribute('role', error ? 'alert' : 'status');
}
function errorText(error) {
  return ({
    'auth/invalid-email': 'Confira o formato do e-mail.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail já tem uma conta. Use a opção Entrar.',
    'auth/weak-password': 'Use uma senha mais forte, com pelo menos 6 caracteres.',
    'auth/password-does-not-meet-requirements': 'A senha precisa atender à política definida no Firebase.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Confira sua conexão com a internet.',
    'auth/operation-not-allowed': 'Habilite E-mail/senha no Firebase Authentication.',
    'auth/user-disabled': 'Esta conta está desativada.',
    'auth/unauthorized-domain': 'Autorize o domínio do site no Firebase Authentication.',
    'auth/invalid-api-key': 'Confira a configuração do seu aplicativo Firebase.',
    'permission-denied': 'Acesso negado. Confira se publicou as regras do Firestore deste projeto.',
    'not-found': 'Esta tarefa já foi excluída, possivelmente em outra aba.',
    'unavailable': 'Não foi possível acessar o banco. Confira sua conexão.',
    'failed-precondition': 'Confira se o banco Firestore padrão (default) foi criado.',
    'resource-exhausted': 'O limite de uso foi atingido. Confira o console Firebase.'
  })[error.code] || 'Não foi possível concluir. Confira a conexão e a configuração do Firebase.';
}
function setAuthMode(value) {
  if (authBusy) return;
  signup = value;
  $('login-tab').setAttribute('aria-pressed', String(!signup));
  $('signup-tab').setAttribute('aria-pressed', String(signup));
  $('confirm-group').hidden = !signup;
  $('confirm-password').disabled = !signup;
  $('confirm-password').required = signup;
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('password').minLength = signup ? 6 : 1;
  $('password').value = $('confirm-password').value = '';
  $('auth-heading').textContent = signup ? 'Vamos florescer?' : 'Seu cantinho está aqui.';
  $('auth-description').textContent = signup ? 'Crie uma conta e dê espaço aos seus planos.' : 'Entre para cuidar dos seus planos.';
  $('auth-submit').textContent = signup ? 'Criar meu cantinho ↗' : 'Entrar no meu cantinho ↗';
}
$('login-tab').addEventListener('click', () => setAuthMode(false));
$('signup-tab').addEventListener('click', () => setAuthMode(true));
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!auth || authBusy) return;
  const email = $('email').value.trim(), password = $('password').value;
  if (signup && password !== $('confirm-password').value) {
    notify('As senhas precisam ser iguais.', true); $('confirm-password').focus(); return;
  }
  authBusy = true;
  $('auth-fields').disabled = $('login-tab').disabled = $('signup-tab').disabled = true;
  notify(signup ? 'Criando seu cantinho…' : 'Entrando…');
  try {
    if (signup) await authAPI.createUserWithEmailAndPassword(auth, email, password);
    else await authAPI.signInWithEmailAndPassword(auth, email, password);
    $('auth-form').reset();
  } catch (error) { notify(errorText(error), true); }
  finally {
    authBusy = false;
    $('auth-fields').disabled = $('login-tab').disabled = $('signup-tab').disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await authAPI.signOut(auth); }
  catch (error) { notify(errorText(error), true); }
  finally { $('logout').disabled = busy; }
});
function controls() {
  $('new-task').disabled = !ready || busy;
  $('task-fields').disabled = busy;
  $('close-dialog').disabled = busy;
  $('logout').disabled = busy;
}
function resetEditor() {
  editingId = null; $('task-form').reset();
  $('editor-heading').textContent = 'Qual é o próximo passo?';
  $('save-task').textContent = 'Adicionar à minha lista ＋';
  notify('', false, 'form-message');
}
function openEditor(task = null) {
  if (!user || !ready || busy) return;
  resetEditor();
  if (task) {
    editingId = task.id;
    $('task-title').value = task.title;
    $('task-description').value = task.description;
    $('task-priority').value = task.priority;
    $('editor-heading').textContent = 'Um ajuste nos planos.';
    $('save-task').textContent = 'Salvar alterações';
  }
  $('task-dialog').showModal(); $('task-title').focus();
}
function closeEditor() { if (!busy) $('task-dialog').close(); }
$('new-task').addEventListener('click', () => openEditor());
$('close-dialog').addEventListener('click', closeEditor);
$('cancel-edit').addEventListener('click', closeEditor);
$('task-dialog').addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
$('task-dialog').addEventListener('close', resetEditor);
function taskRef(id) { return dbAPI.doc(db, 'users', user.uid, 'tasks', id); }

// O sucesso só é mostrado após a confirmação do servidor.
async function mutate(operation, success, inDialog = false) {
  if (!user || !ready || busy) return;
  const target = inDialog ? 'form-message' : 'message';
  if (!navigator.onLine) { notify('Você está sem internet. Reconecte para salvar suas alterações.', true, target); render(); return; }
  const current = session;
  busy = true; controls(); render();
  notify('Salvando seus planos… Aguarde a confirmação.', false, target);
  try {
    await operation();
    if (current !== session) return;
    if (inDialog) $('task-dialog').close();
    notify(success);
  } catch (error) {
    if (current === session) notify(errorText(error), true, target);
  } finally {
    if (current === session) { busy = false; controls(); render(); }
  }
}
$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!user || !ready || busy) return;
  const title = $('task-title').value.trim();
  if (!title) { notify('Escreva um título para sua tarefa.', true, 'form-message'); $('task-title').focus(); return; }
  const data = {
    title, description: $('task-description').value.trim(), priority: $('task-priority').value,
    updatedAt: dbAPI.serverTimestamp()
  };
  const id = editingId;
  const target = id ? taskRef(id) : dbAPI.collection(db, 'users', user.uid, 'tasks');
  void mutate(() => id ? dbAPI.updateDoc(target, data) : dbAPI.addDoc(target, { ...data, done: false, createdAt: dbAPI.serverTimestamp() }),
    id ? 'Tarefa atualizada.' : 'Um novo plano na sua lista!', true);
});
function element(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function normalize(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
function render() {
  const completed = tasks.filter((task) => task.done).length;
  $('total').textContent = tasks.length; $('pending').textContent = tasks.length - completed; $('completed').textContent = completed;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $('progress-ring').style.setProperty('--progress', progress * 3.6 + 'deg');
  $('progress-value').textContent = progress + '%';
  $('progress-caption').textContent = tasks.length ? completed + ' de ' + tasks.length + ' planos concluídos.' : 'Sua próxima conquista começa aqui.';
  const search = normalize($('search').value.trim());
  const visible = tasks.filter((task) => (filter === 'all' || (filter === 'done' ? task.done : !task.done)) &&
    normalize(task.title + ' ' + task.description).includes(search));
  $('visible-count').textContent = visible.length + (visible.length === 1 ? ' tarefa' : ' tarefas');
  $('empty').hidden = visible.length > 0;
  $('empty-title').textContent = !ready ? 'Preparando seu cantinho…' : tasks.length ? 'Tudo tranquilo por aqui.' : 'Seu próximo passo começa aqui.';
  $('empty-text').textContent = !ready ? 'Aguardando acesso ao banco de dados.' : tasks.length ? 'Nenhuma tarefa corresponde a esta busca ou filtro.' : 'Clique em “Nova tarefa” e dê espaço aos seus planos.';
  const fragment = document.createDocumentFragment();
  for (const task of visible) {
    const item = element('li', 'task' + (task.done ? ' done' : ''));
    const checkbox = element('input', 'task-check');
    checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.disabled = busy || !ready;
    checkbox.setAttribute('aria-label', (task.done ? 'Reabrir' : 'Concluir') + ' tarefa: ' + task.title);
    checkbox.addEventListener('change', () => {
      const target = taskRef(task.id), done = checkbox.checked;
      void mutate(() => dbAPI.updateDoc(target, { done, updatedAt: dbAPI.serverTimestamp() }),
        done ? 'Mais uma conquista! Tarefa concluída.' : 'Tarefa reaberta.');
    });
    const body = element('div', 'task-body');
    body.append(element('h3', 'task-title', task.title));
    if (task.description) body.append(element('p', 'task-description', task.description));
    const meta = element('div', 'task-meta');
    meta.append(element('span', 'badge ' + task.priority, 'Prioridade ' + task.priority));
    const actions = element('div', 'task-actions');
    const edit = element('button', '', 'Editar'); edit.type = 'button'; edit.disabled = busy || !ready;
    edit.setAttribute('aria-label', 'Editar tarefa: ' + task.title); edit.addEventListener('click', () => openEditor(task));
    const remove = element('button', '', 'Excluir'); remove.type = 'button'; remove.disabled = busy || !ready;
    remove.setAttribute('aria-label', 'Excluir tarefa: ' + task.title);
    remove.addEventListener('click', () => {
      if (!window.confirm('Excluir a tarefa “' + task.title + '”? Esta ação não pode ser desfeita.')) return;
      const target = taskRef(task.id);
      void mutate(() => dbAPI.deleteDoc(target), 'Tarefa excluída.');
    });
    actions.append(edit, remove); meta.append(actions); body.append(meta); item.append(checkbox, body); fragment.append(item);
  }
  $('task-list').replaceChildren(fragment);
}
$('search').addEventListener('input', render);
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
function sessionChanged(currentUser) {
  const current = ++session;
  if (stopListening) stopListening();
  stopListening = null; user = currentUser; tasks = []; ready = false; busy = false;
  if ($('task-dialog').open) $('task-dialog').close();
  resetEditor(); $('search').value = ''; filter = 'all';
  document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.filter === 'all')));
  $('auth-view').hidden = !!user; $('dashboard').hidden = !user;
  $('logout').hidden = $('sidebar-summary').hidden = !user;
  $('account').textContent = user ? 'Seu espaço pessoal · ' + user.email : '';
  notify(); controls(); render();
  if (!user) return;
  $('sync-status').textContent = 'Conectando…';
  const query = dbAPI.query(dbAPI.collection(db, 'users', user.uid, 'tasks'), dbAPI.orderBy('createdAt', 'desc'));
  stopListening = dbAPI.onSnapshot(query, { includeMetadataChanges: true }, (snapshot) => {
    if (current !== session) return;
    ready = true;
    tasks = snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      $('task-dialog').close(); notify('A tarefa em edição foi removida em outra aba.');
    }
    $('sync-status').textContent = snapshot.metadata.hasPendingWrites ? 'Salvando alterações…' : snapshot.metadata.fromCache ? 'Aguardando conexão…' : 'Tudo atualizado';
    controls(); render();
  }, (error) => {
    if (current !== session) return;
    ready = false; tasks = []; controls(); render();
    $('sync-status').textContent = 'Falha na conexão';
    $('empty-title').textContent = 'Não foi possível abrir sua lista.';
    $('empty-text').textContent = 'Confira as regras do Firestore e atualize a página.';
    notify(errorText(error), true);
  });
}
async function initialize() {
  try {
    const settings = await import('./firebase-config.js'), config = settings.firebaseConfig;
    if (['apiKey', 'authDomain', 'projectId', 'appId'].some((key) => !config || typeof config[key] !== 'string' || !config[key].trim() || /COLE_|SEU_PROJETO/.test(config[key]))) {
      $('setup').hidden = false; return;
    }
    const [appAPI, authentication, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
    ]);
    authAPI = authentication; dbAPI = firestore;
    const app = appAPI.initializeApp(config);
    auth = authAPI.getAuth(app); db = dbAPI.getFirestore(app);
    // Exclusivo dos testes locais. A configuração entregue não ativa emuladores.
    if (settings.useEmulators === true) {
      if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Emuladores apenas no computador local.');
      authAPI.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      dbAPI.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    await authAPI.setPersistence(auth, authAPI.browserSessionPersistence);
    authAPI.onAuthStateChanged(auth, sessionChanged, (error) => notify(errorText(error), true));
    $('auth-fields').disabled = false;
  } catch (error) {
    console.error('Falha ao iniciar:', error.code || error.name);
    notify('Não foi possível iniciar. Abra pelo Live Server e confira a conexão e a configuração do Firebase.', true);
  }
}
void initialize();
