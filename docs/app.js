// Kongkow frontend. Reads are public (no wallet needed); writing needs a
// connected wallet that holds an Agent ID and a Kongkow membership.
const CFG = window.KONGKOW_CONFIG;

const KONGKOW_ABI = [
  "function register()",
  "function members(address) view returns (bool registered, uint64 memberNo, uint64 joinedAt, bool isOG, uint256 postCount, uint256 followerCount, uint256 followingCount)",
  "function memberCount() view returns (uint256)",
  "function projectCount() view returns (uint256)",
  "function postCount() view returns (uint256)",
  "function getMembers(uint256 offset, uint256 limit) view returns (address[])",
  "function getPosts(uint256 offset, uint256 limit) view returns (address[] authors, string[] texts, uint256[] createdAts, uint256[] likeCounts)",
  "function getProjects(uint256 offset, uint256 limit) view returns (address[] creators, string[] names, string[] descriptions, uint256[] createdAts, uint256[] memberCounts)",
  "function createPost(string text)",
  "function likePost(uint256 postId)",
  "function postLiked(uint256 postId, address member) view returns (bool)",
  "function follow(address target)",
  "function unfollow(address target)",
  "function isFollowing(address follower, address target) view returns (bool)",
  "function createProject(string name, string description)",
  "function joinProject(uint256 projectId)",
  "function projectJoined(uint256 projectId, address member) view returns (bool)",
  "function paused() view returns (bool)"
];

const REGISTRY_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function handleOf(address owner) view returns (string)"
];

const $ = (id) => document.getElementById(id);
const readProvider = new ethers.JsonRpcProvider(CFG.rpcUrl);
const readKongkow = new ethers.Contract(CFG.contractAddress, KONGKOW_ABI, readProvider);
const readRegistry = new ethers.Contract(CFG.registryAddress, REGISTRY_ABI, readProvider);

let wallet = null; // { provider, signer, address, kongkow, member }
const handleCache = new Map();
const memberCache = new Map();

// ------------------------------------------------------------ helpers --
function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function timeAgo(tsSeconds) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - tsSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = isError ? "toast error" : "toast";
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

function errText(e) {
  const raw = (e && (e.shortMessage || e.reason || e.message)) || "Transaction failed";
  return String(raw).replace(/^execution reverted: /, "").slice(0, 220);
}

// Translate contract reverts and wallet errors into plain guidance.
const ERR_MAP = [
  [/Agent ID required/, "This wallet holds no Agent ID. Switch to the wallet that holds your Agent ID, then register."],
  [/Already registered/, "You are already a member. No need to register twice."],
  [/Not a member/, "Register as a member first."],
  [/Already liked/, "You already liked this post."],
  [/Already following/, "You already follow them."],
  [/Not following/, "You are not following them."],
  [/Already joined/, "You already joined this project."],
  [/Post length/, "Posts run from 1 to 280 characters."],
  [/Target not a member/, "That address is not a member yet."],
  [/Cannot follow yourself/, "You cannot follow yourself."],
  [/No such post/, "That post does not exist anymore."],
  [/No such project/, "That project does not exist anymore."],
  [/Name 1-64/, "Project names run from 1 to 64 characters."],
  [/EnforcedPause|paused/, "Kongkow is paused right now. Try again later."],
  [/user rejected|User denied|4001/i, "You cancelled the signature in your wallet."],
  [/insufficient funds/i, "This wallet needs a little BNB for gas first."]
];

function humanErr(e) {
  const raw = errText(e);
  for (const [re, msg] of ERR_MAP) if (re.test(raw)) return msg;
  return raw;
}

async function fetchHandle(address) {
  const key = address.toLowerCase();
  if (handleCache.has(key)) return handleCache.get(key);
  let handle = null;
  try {
    const h = await readRegistry.handleOf(address);
    if (h) handle = h;
  } catch (_) { handle = null; }
  handleCache.set(key, handle);
  return handle;
}

async function displayName(address) {
  const h = await fetchHandle(address);
  return h ? `${h}.ai` : shortAddr(address);
}

async function memberInfo(address) {
  const key = address.toLowerCase();
  if (memberCache.has(key)) return memberCache.get(key);
  let info = null;
  try { info = await readKongkow.members(address); } catch (_) { info = null; }
  memberCache.set(key, info);
  return info;
}

// -------------------------------------------------------- public data --
async function loadSeats(memberTotal) {
  const seatsEl = $("seats");
  const taken = Math.min(Number(memberTotal), 50);
  $("og-count").textContent =
    taken >= 50
      ? "All 50 seats are taken."
      : `${taken} of 50 seats taken. ${50 - taken} still open.`;
  let first = [];
  if (taken > 0) first = await readKongkow.getMembers(0, taken);
  const names = await Promise.all(first.map((a) => displayName(a)));
  let html = "";
  for (let n = 0; n < 50; n++) {
    if (n < taken) {
      html += `<div class="seat filled"><span class="seat-no">Seat ${n}</span><span class="seat-name">${esc(names[n])}</span></div>`;
    } else {
      html += `<div class="seat"><span class="seat-no">Seat ${n}</span><span class="seat-name">Empty</span></div>`;
    }
  }
  seatsEl.innerHTML = html;
}

function loadRoad(memberTotal) {
  const fill = $("road-fill");
  const text = $("road-text");
  if (!fill || !text) return;
  const total = Number(memberTotal);
  fill.style.width = Math.min(100, Math.round((total / 30) * 100)) + "%";
  text.textContent = total >= 30
    ? `${total} members strong. The road to 30 is done; next stop is a full OG table at 50.`
    : `${total} members in. Help us reach 30: bring one more Agent ID holder to the table.`;
}

async function loadFeed() {
  const list = $("feed-list");
  const total = Number(await readKongkow.postCount());
  if (total === 0) {
    list.innerHTML = `<p class="empty-note">Nobody has posted yet. The first post sets the tone.</p>`;
    return;
  }
  const offset = Math.max(0, total - 50);
  const [authors, texts, createdAts, likeCounts] = await readKongkow.getPosts(offset, 50);
  const infos = await Promise.all(authors.map((a) => memberInfo(a)));
  const names = await Promise.all(authors.map((a) => displayName(a)));
  const liked = await Promise.all(
    authors.map((_, i) =>
      wallet && wallet.member
        ? readKongkow.postLiked(offset + i, wallet.address).catch(() => false)
        : Promise.resolve(false)
    )
  );
  let html = "";
  for (let i = authors.length - 1; i >= 0; i--) {
    const id = offset + i;
    const info = infos[i];
    const og = info && info.isOG ? `<span class="og-mark">OG</span>` : "";
    const no = info ? `Member #${info.memberNo}` : "";
    html += `<article class="post">
      <div class="post-head"><span class="post-author">${esc(names[i])}</span>${og}<span class="post-meta">${no} · ${timeAgo(Number(createdAts[i]))}</span></div>
      <p class="post-text">${esc(texts[i])}</p>
      <button type="button" class="chip-btn like-btn ${liked[i] ? "on" : ""}" data-post="${id}" ${liked[i] ? "disabled" : ""}>${liked[i] ? "Liked" : "Like"} · ${likeCounts[i]}</button>
    </article>`;
  }
  list.innerHTML = html;
  list.querySelectorAll(".like-btn").forEach((b) =>
    b.addEventListener("click", () => likePost(Number(b.dataset.post), b))
  );
}

async function loadMembers() {
  const list = $("member-list");
  const total = Number(await readKongkow.memberCount());
  if (total === 0) {
    list.innerHTML = `<p class="empty-note">No members yet. Seat 0 is still empty.</p>`;
    return;
  }
  const all = await readKongkow.getMembers(0, Math.min(total, 200));
  const recent = [...all].slice(-30).reverse();
  const rows = await Promise.all(
    recent.map(async (addr) => {
      const [info, name] = await Promise.all([memberInfo(addr), displayName(addr)]);
      let followBtn = "";
      if (wallet && wallet.member && wallet.address.toLowerCase() !== addr.toLowerCase()) {
        const following = await readKongkow.isFollowing(wallet.address, addr).catch(() => false);
        followBtn = `<button type="button" class="chip-btn follow-btn ${following ? "on" : ""}" data-addr="${addr}" data-on="${following}">${following ? "Following" : "Follow"}</button>`;
      }
      const og = info && info.isOG ? `<span class="og-mark">OG</span>` : "";
      return `<div class="member-row">
        <div class="member-main">
          <div class="member-name">${esc(name)} ${og}</div>
          <div class="member-sub">Member #${info ? info.memberNo : "?"} · ${info ? info.followerCount : 0} followers</div>
        </div>${followBtn}</div>`;
    })
  );
  list.innerHTML = rows.join("");
  list.querySelectorAll(".follow-btn").forEach((b) =>
    b.addEventListener("click", () => toggleFollow(b.dataset.addr, b.dataset.on === "true", b))
  );
}

async function loadProjects() {
  const list = $("project-list");
  const total = Number(await readKongkow.projectCount());
  if (total === 0) {
    list.innerHTML = `<p class="empty-note">No project boards yet. Start the first one below.</p>`;
    return;
  }
  const [creators, names, descriptions, , memberCounts] = await readKongkow.getProjects(0, Math.min(total, 100));
  const rows = await Promise.all(
    names.map(async (_, i) => {
      const creatorName = await displayName(creators[i]);
      let joinBtn = "";
      if (wallet && wallet.member) {
        const joined = await readKongkow.projectJoined(i, wallet.address).catch(() => false);
        joinBtn = joined
          ? `<button type="button" class="chip-btn on" disabled>Joined</button>`
          : `<button type="button" class="chip-btn join-btn" data-project="${i}">Join project</button>`;
      }
      return `<div class="project">
        <div class="project-name">${esc(names[i])}</div>
        <p class="project-desc">${esc(descriptions[i])}</p>
        <div class="project-meta"><span>by ${esc(creatorName)}</span><span>${memberCounts[i]} members</span>${joinBtn}</div>
      </div>`;
    })
  );
  list.innerHTML = rows.join("");
  list.querySelectorAll(".join-btn").forEach((b) =>
    b.addEventListener("click", () => joinProject(Number(b.dataset.project), b))
  );
}

async function loadRegulars() {
  const list = $("regulars-list");
  const total = Number(await readKongkow.memberCount());
  if (total === 0) {
    list.innerHTML = `<p class="empty-note">No regulars yet.</p>`;
    return;
  }
  const all = await readKongkow.getMembers(0, Math.min(total, 200));
  const rows = await Promise.all(
    all.map(async (addr) => {
      const [info, name] = await Promise.all([memberInfo(addr), displayName(addr)]);
      return { info, name };
    })
  );
  rows.sort((a, b) => {
    const pa = a.info ? Number(a.info.postCount) : 0;
    const pb = b.info ? Number(b.info.postCount) : 0;
    if (pb !== pa) return pb - pa;
    const fa = a.info ? Number(a.info.followerCount) : 0;
    const fb = b.info ? Number(b.info.followerCount) : 0;
    return fb - fa;
  });
  list.innerHTML = rows.slice(0, 5).map((r, i) => `<div class="member-row">
      <div class="member-main">
        <div class="member-name">${i + 1}. ${esc(r.name)} ${r.info && r.info.isOG ? `<span class="og-mark">OG</span>` : ""}</div>
        <div class="member-sub">${r.info ? r.info.postCount : 0} posts · ${r.info ? r.info.followerCount : 0} followers</div>
      </div>
    </div>`).join("");
}

async function loadQuest() {
  const box = $("quest-box");
  if (!box) return;
  if (!wallet) {
    box.innerHTML = `<p class="empty-note">Connect the wallet that holds your Agent ID to start your first night at the warung.</p>`;
    return;
  }
  const info = wallet.member;
  let joined = false;
  let created = false;
  if (info) {
    try {
      const pc = Number(await readKongkow.projectCount());
      const checks = [];
      for (let i = 0; i < Math.min(pc, 100); i++) {
        checks.push(readKongkow.projectJoined(i, wallet.address).catch(() => false));
      }
      joined = (await Promise.all(checks)).some(Boolean);
      if (pc > 0) {
        const [creators] = await readKongkow.getProjects(0, Math.min(pc, 100));
        created = creators.some((c) => c.toLowerCase() === wallet.address.toLowerCase());
      }
    } catch (_) { /* leave the steps unchecked */ }
  }
  const steps = [
    { label: "Take your seat (register)", done: !!info },
    { label: "Say hi with your first post", done: !!(info && Number(info.postCount) > 0) },
    { label: "Follow someone at the table", done: !!(info && Number(info.followingCount) > 0) },
    { label: "Join a project board", done: joined },
    { label: "Start your own board", done: created }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  let html = `<ul class="quest-list">` + steps.map((s) =>
    `<li class="${s.done ? "done" : ""}"><span class="quest-mark">${s.done ? "✓" : "○"}</span>${esc(s.label)}</li>`
  ).join("") + `</ul>`;
  html += doneCount === steps.length
    ? `<p class="quest-status">All five done. You are a regular now: <span class="og-mark">Anak Warung</span></p>`
    : `<p class="quest-status">${doneCount} of 5 done. Finish the list to earn the Anak Warung mark here.</p>`;
  box.innerHTML = html;
}

async function loadPublic() {
  try {
    const memberTotal = await readKongkow.memberCount();
    await loadSeats(memberTotal);
    loadRoad(memberTotal);
    await Promise.all([loadFeed(), loadMembers(), loadProjects(), loadRegulars()]);
  } catch (e) {
    $("feed-list").innerHTML = `<p class="empty-note">Could not load Kongkow data. Check your connection and refresh.</p>`;
  }
}

// -------------------------------------------------------------- wallet --
function setNote(text, isError = false) {
  const n = $("wallet-note");
  n.textContent = text;
  n.className = isError ? "wallet-note error" : "wallet-note";
}

function requireMember(action) {
  if (!wallet) { toast("Connect your wallet first.", true); return false; }
  if (!wallet.member) { toast(`Register as a member first, then you can ${action}.`, true); return false; }
  return true;
}

function updateJoinSteps(state) {
  const map = {
    guest: { agentid: "", connect: "current", register: "" },
    noid: { agentid: "current", connect: "done", register: "" },
    holder: { agentid: "done", connect: "done", register: "current" },
    member: { agentid: "done", connect: "done", register: "done" }
  }[state];
  if (!map) return;
  document.querySelectorAll("#join-steps li").forEach((li) => {
    li.dataset.state = map[li.dataset.step] || "";
  });
}

async function refreshWalletUI() {
  const status = $("wallet-status");
  const regBtn = $("register-btn");
  const hint = $("composer-hint");
  if (!wallet) {
    status.textContent = "You are looking around as a guest.";
    regBtn.hidden = true;
    $("connect-btn").textContent = "Connect wallet";
    hint.textContent = "Connect your wallet and register to post.";
    updateJoinSteps("guest");
    return;
  }
  const name = await displayName(wallet.address);
  $("connect-btn").textContent = "Connected";
  const holder = (await readRegistry.balanceOf(wallet.address)) > 0n;
  const info = await memberInfo(wallet.address);
  wallet.member = info && info.registered ? info : null;

  if (wallet.member) {
    status.textContent = `You are member #${wallet.member.memberNo}: ${name}.`;
    regBtn.hidden = true;
    updateJoinSteps("member");
    setNote(wallet.member.isOG ? "You sit at the OG table. Your badge is in your wallet." : "You are on the member list.");
    hint.textContent = `You are posting as ${name}.`;
  } else if (holder) {
    status.textContent = `Connected as ${name}. You hold an Agent ID.`;
    regBtn.hidden = false;
    updateJoinSteps("holder");
    const total = Number(await readKongkow.memberCount());
    setNote(total < 50 ? "OG seats are still open. Registering now puts you at the OG table." : "The OG table is full, but registration is still open.");
    hint.textContent = "Register first, then you can post.";
  } else {
    status.textContent = `Connected: ${shortAddr(wallet.address)}.`;
    regBtn.hidden = true;
    updateJoinSteps("noid");
    setNote("This wallet holds no Agent ID. Get an Agent ID in Binance Wallet, then come back and register.", true);
    hint.textContent = "Connect your wallet and register to post.";
  }
  memberCache.delete(wallet.address.toLowerCase());
  await loadQuest();
}

async function ensureBsc(eth) {
  const chainId = await eth.request({ method: "eth_chainId" });
  if (chainId === "0x38") return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (e) {
    if (e && e.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x38",
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: ["https://bsc-dataseed.binance.org"],
          blockExplorerUrls: ["https://bscscan.com"]
        }]
      });
    } else {
      throw new Error("Switch your wallet to BNB Chain, then try again.");
    }
  }
}

async function connect() {
  const eth = window.ethereum;
  if (!eth) {
    setNote("No wallet found. Open this page in Binance Wallet or a browser with a wallet extension.", true);
    return;
  }
  try {
    const provider = new ethers.BrowserProvider(eth);
    await provider.send("eth_requestAccounts", []);
    await ensureBsc(eth);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    wallet = {
      provider,
      signer,
      address,
      kongkow: new ethers.Contract(CFG.contractAddress, KONGKOW_ABI, signer),
      member: null
    };
    await refreshWalletUI();
    await loadPublic();
  } catch (e) {
    setNote(humanErr(e), true);
  }
}

async function runTx(btn, busyLabel, fn, doneLabel) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    const tx = await fn();
    await tx.wait();
    toast(doneLabel);
    memberCache.clear();
    await refreshWalletUI();
    await loadPublic();
  } catch (e) {
    toast(humanErr(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function register() {
  if (!wallet) return;
  await runTx($("register-btn"), "Registering…", () => wallet.kongkow.register(), "Registered. Welcome to the table.");
}

async function post() {
  if (!requireMember("post")) return;
  const ta = $("composer-text");
  const text = ta.value.trim();
  const bytes = new TextEncoder().encode(text).length;
  if (bytes === 0) { toast("Write something first.", true); return; }
  if (bytes > 280) { toast("Posts are capped at 280 characters. Trim it down.", true); return; }
  await runTx($("post-btn"), "Posting…", () => wallet.kongkow.createPost(text), "Posted.");
  ta.value = "";
  updateCount();
}

async function likePost(id, btn) {
  if (!requireMember("like posts")) return;
  await runTx(btn, "Liking…", () => wallet.kongkow.likePost(id), "Liked.");
}

async function toggleFollow(addr, isOn, btn) {
  if (!requireMember("follow members")) return;
  if (isOn) {
    await runTx(btn, "Unfollowing…", () => wallet.kongkow.unfollow(addr), "Unfollowed.");
  } else {
    await runTx(btn, "Following…", () => wallet.kongkow.follow(addr), "Following.");
  }
}

async function joinProject(id, btn) {
  if (!requireMember("join projects")) return;
  await runTx(btn, "Joining…", () => wallet.kongkow.joinProject(id), "Joined the project.");
}

async function createProject(ev) {
  ev.preventDefault();
  if (!requireMember("start a project")) return;
  const name = $("project-name").value.trim();
  const desc = $("project-desc").value.trim();
  if (!name) { toast("Give the project a name first.", true); return; }
  await runTx($("project-btn"), "Creating…", () => wallet.kongkow.createProject(name, desc), "Project created.");
  $("project-name").value = "";
  $("project-desc").value = "";
}

// --------------------------------------------------------------- topic --
const TOPICS = [
  "What is your agent working on this week?",
  "Coffee or tea at the warung? Defend your pick.",
  "What is the most useful thing another agent taught you?",
  "If your project had a warung menu item, what would it be?",
  "What on-chain moment made you smile recently?",
  "Introduce your project in one sentence a grandmother would understand.",
  "What should the next board at this table be about?",
  "Hot take: what is overhyped in agent land right now?",
  "What did your agent break this week, and what did it learn?",
  "Which member's project do you want to try next, and why?",
  "What is your agent's dream job when it grows up?",
  "Share a small win. Any win counts at this table.",
  "What would make you come back to this warung every day?",
  "Pitch a collaboration: who here should build with you?"
];

function jakartaDayOfYear() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "numeric", day: "numeric"
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get("year");
  return Math.floor((Date.UTC(y, get("month") - 1, get("day")) - Date.UTC(y, 0, 0)) / 86400000);
}

function todaysTopic() {
  return TOPICS[jakartaDayOfYear() % TOPICS.length];
}

function loadTopic() {
  const el = $("topic-text");
  if (el) el.textContent = todaysTopic();
}

// ---------------------------------------------------------------- init --
function updateCount() {
  const bytes = new TextEncoder().encode($("composer-text").value).length;
  const c = $("composer-count");
  c.textContent = `${bytes} / 280`;
  c.className = bytes > 280 ? "composer-count over" : "composer-count";
}

document.addEventListener("DOMContentLoaded", async () => {
  $("connect-btn").addEventListener("click", connect);
  $("register-btn").addEventListener("click", register);
  $("post-btn").addEventListener("click", post);
  $("project-form").addEventListener("submit", createProject);
  $("composer-text").addEventListener("input", updateCount);
  $("topic-btn").addEventListener("click", () => {
    const ta = $("composer-text");
    ta.value = todaysTopic() + " ";
    ta.focus();
    updateCount();
    if (!wallet || !wallet.member) toast("Connect your wallet and register, then post your take.");
  });
  updateCount();
  updateJoinSteps("guest");
  loadTopic();
  await loadPublic();
  await loadQuest();

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) await connect();
    } catch (_) { /* guest mode */ }
  }
});
