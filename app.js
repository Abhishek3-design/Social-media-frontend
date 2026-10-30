(() => {
  "use strict";

  const API_BASE = (window.APP_CONFIG?.API_BASE_URL || "").trim().replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const state = { token: localStorage.getItem("simple_social_token"), user: null, page: "feed" };

  const authView = $("auth-view");
  const appView = $("app-view");
  const loginForm = $("login-form");
  const signupForm = $("signup-form");
  const authMessage = $("auth-message");
  const feedMessage = $("feed-message");
  const uploadMessage = $("upload-message");

  function showMessage(el, message, type = "info") {
    el.textContent = message;
    el.className = `message ${type}`;
    el.classList.remove("hidden");
  }
  function hideMessage(el) { el.textContent = ""; el.className = "message hidden"; }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
  function initials(email) {
    return (email || "S").trim().charAt(0).toUpperCase() || "S";
  }
  function setUserUI() {
    const email = state.user?.email || "You";
    $("header-user").textContent = email;
    $("header-user").classList.remove("hidden");
    $("logout-btn").classList.remove("hidden");
    $("sidebar-email").textContent = email;
    $("upload-email").textContent = email;
    $("avatar").textContent = initials(email);
    $("upload-avatar").textContent = initials(email);
  }
  function setLoggedOutUI() {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    $("header-user").classList.add("hidden");
    $("logout-btn").classList.add("hidden");
  }
  function setLoggedInUI() {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    setUserUI();
    navigate("feed");
    loadFeed();
  }
  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem("simple_social_token");
    setLoggedOutUI();
    showMessage(authMessage, "You have been logged out.", "success");
  }
  function requireApi() {
    if (!API_BASE || API_BASE.includes("YOUR-FASTAPI-VERCEL-URL")) {
      throw new Error("Set your deployed FastAPI URL in config.js before using the app.");
    }
  }
  async function api(path, options = {}) {
    requireApi();
    const headers = new Headers(options.headers || {});
    if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { detail: text }; }
    }
    if (!response.ok) {
      if (response.status === 401 && state.token) {
        logout();
        throw new Error("Your session expired. Please log in again.");
      }
      const detail = data?.detail || data?.message || `Request failed (${response.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
  }
  async function loadCurrentUser() {
    state.user = await api("/users/me");
  }

  $("login-tab").addEventListener("click", () => switchAuth("login"));
  $("signup-tab").addEventListener("click", () => switchAuth("signup"));
  function switchAuth(mode) {
    const login = mode === "login";
    loginForm.classList.toggle("hidden", !login);
    signupForm.classList.toggle("hidden", login);
    $("login-tab").classList.toggle("active", login);
    $("signup-tab").classList.toggle("active", !login);
    $("login-tab").setAttribute("aria-selected", String(login));
    $("signup-tab").setAttribute("aria-selected", String(!login));
    hideMessage(authMessage);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(authMessage);
    const button = loginForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const form = new URLSearchParams();
      form.set("username", $("login-email").value.trim());
      form.set("password", $("login-password").value);
      const data = await api("/auth/jwt/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      });
      state.token = data.access_token;
      localStorage.setItem("simple_social_token", state.token);
      await loadCurrentUser();
      hideMessage(authMessage);
      setLoggedInUI();
    } catch (error) {
      showMessage(authMessage, friendlyError(error), "error");
    } finally { button.disabled = false; }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(authMessage);
    const button = signupForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api("/register/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: $("signup-email").value.trim(),
          password: $("signup-password").value
        })
      });
      showMessage(authMessage, "Account created successfully. You can now log in.", "success");
      switchAuth("login");
      showMessage(authMessage, "Account created successfully. Please log in.", "success");
      $("login-email").value = $("signup-email").value.trim();
      $("login-password").value = "";
    } catch (error) {
      showMessage(authMessage, friendlyError(error), "error");
    } finally { button.disabled = false; }
  });

  $("logout-btn").addEventListener("click", logout);
  $("refresh-btn").addEventListener("click", loadFeed);
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });
  function navigate(page) {
    state.page = page;
    $("feed-page").classList.toggle("hidden", page !== "feed");
    $("upload-page").classList.toggle("hidden", page !== "upload");
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === page);
    });
    if (page === "feed") loadFeed();
  }

  $("media-file").addEventListener("change", () => {
    const file = $("media-file").files[0];
    $("file-name").textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected";
  });
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  $("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(uploadMessage);
    const file = $("media-file").files[0];
    if (!file) return showMessage(uploadMessage, "Choose an image or video first.", "error");
    const button = $("upload-form").querySelector("button[type=submit]");
    const form = new FormData();
    form.append("file", file);
    form.append("caption", $("caption").value);
    button.disabled = true;
    button.textContent = "Uploading…";
    try {
      await api("/upload", { method: "POST", body: form });
      $("caption").value = "";
      $("media-file").value = "";
      $("file-name").textContent = "No file selected";
      showMessage(uploadMessage, "Post shared successfully!", "success");
      navigate("feed");
      await loadFeed();
    } catch (error) {
      showMessage(uploadMessage, friendlyError(error), "error");
    } finally {
      button.disabled = false;
      button.innerHTML = 'Share post <span>→</span>';
    }
  });

  async function loadFeed() {
    if (!state.token || state.page !== "feed") return;
    hideMessage(feedMessage);
    const list = $("feed-list");
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>Loading your feed…</h3><p>Just a moment.</p></div>';
    try {
      const data = await api("/feed");
      const posts = Array.isArray(data) ? data : (data?.posts || []);
      if (!posts.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">✦</div><h3>Your feed starts here</h3><p>No posts yet. Create the first post and start the conversation.</p></div>';
        return;
      }
      list.innerHTML = posts.map(renderPost).join("");
      attachPostEvents(posts);
    } catch (error) {
      list.innerHTML = "";
      showMessage(feedMessage, friendlyError(error), "error");
    }
  }
  function renderPost(post) {
    const id = post.id;
    const email = escapeHtml(post.email || "User");
    const dateRaw = post.created_at || "";
    const date = escapeHtml(dateRaw ? dateRaw.slice(0, 10) : "");
    const caption = escapeHtml(post.caption || "");
    const mediaUrl = safeUrl(post.url || "");
    const fileType = (post.file_type || "").toLowerCase();
    let media = "";
    if (mediaUrl && fileType === "image") {
      media = `<img class="post-media" src="${mediaUrl}" alt="Post image" loading="lazy">`;
    } else if (mediaUrl) {
      media = `<video class="post-media" src="${mediaUrl}" controls preload="metadata"></video>`;
    }
    const liked = Boolean(post.liked_by_me);
    const likes = Number(post.likes_count || 0);
    const deleteButton = post.is_owner ? `<button class="icon-button delete-post" data-id="${escapeHtml(id)}" title="Delete post" aria-label="Delete post">⋯</button>` : "";
    return `<article class="post-card" data-post-id="${escapeHtml(id)}">
      <div class="post-head"><div class="post-author"><div class="avatar">${escapeHtml(initials(post.email || "U"))}</div><div><strong>${email}</strong><small>${date}</small></div></div>${deleteButton}</div>
      ${caption ? `<div class="post-caption">${caption}</div>` : ""}
      ${media}
      <div class="post-actions"><button class="like-button" data-id="${escapeHtml(id)}" data-liked="${liked}" aria-label="${liked ? "Unlike" : "Like"} post">${liked ? "❤️" : "🤍"}</button><span class="like-count">${likes} ${likes === 1 ? "like" : "likes"}</span></div>
      <div class="comments"><div class="comments-title">Comments</div><div class="comments-list" data-comments-for="${escapeHtml(id)}"><div class="muted">Loading comments…</div></div>
        <form class="comment-form" data-id="${escapeHtml(id)}"><input name="comment" maxlength="1000" placeholder="Write a comment…" aria-label="Write a comment" required><button type="submit">Post</button></form>
      </div>
    </article>`;
  }
  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol === "https:" || url.protocol === "http:") return escapeHtml(url.href);
    } catch {}
    return "";
  }
  function attachPostEvents(posts) {
    document.querySelectorAll(".like-button").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        const id = button.dataset.id;
        const wasLiked = button.dataset.liked === "true";
        const countElement = button.parentElement.querySelector(".like-count");
        const oldCount = Number.parseInt(countElement?.textContent || "0", 10) || 0;
        try {
          await api(`/posts/${encodeURIComponent(id)}/like`, { method: wasLiked ? "DELETE" : "POST" });
          const nowLiked = !wasLiked;
          const newCount = Math.max(0, oldCount + (nowLiked ? 1 : -1));
          button.dataset.liked = String(nowLiked);
          button.innerHTML = nowLiked ? "❤️" : "🤍";
          button.setAttribute("aria-label", nowLiked ? "Unlike post" : "Like post");
          if (countElement) countElement.textContent = `${newCount} ${newCount === 1 ? "like" : "likes"}`;
        } catch (error) {
          showMessage(feedMessage, friendlyError(error), "error");
        } finally {
          button.disabled = false;
        }
      });
    });

    document.querySelectorAll(".delete-post").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this post? This cannot be undone.")) return;
        button.disabled = true;
        try {
          await api(`/posts/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
          // Remove only this post from the page; do not reload the feed.
          const postCard = button.closest('.post-card');
          if (postCard) postCard.remove();

          // Show the empty-feed message only when no posts remain.
          const feedList = $('feed-list');
          if (feedList && !feedList.querySelector('.post-card')) {
            feedList.innerHTML = '<div class="empty-state"><div class="empty-icon">✦</div><h3>Your feed starts here</h3><p>No posts yet. Create the first post and start the conversation.</p></div>';
          }
        } catch (error) {
          showMessage(feedMessage, friendlyError(error), "error");
          button.disabled = false;
        }
      });
    });

    document.querySelectorAll(".comment-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.elements.comment;
        const content = input.value.trim();
        if (!content) return;
        const button = form.querySelector("button");
        button.disabled = true;
        const postId = form.dataset.id;
        try {
          await api(`/posts/${encodeURIComponent(postId)}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
          });
          input.value = "";
          const commentsContainer = document.querySelector(`.comments-list[data-comments-for="${CSS.escape(postId)}"]`);
          if (commentsContainer) await loadComments(postId, commentsContainer);
        } catch (error) {
          showMessage(feedMessage, friendlyError(error), "error");
        } finally {
          button.disabled = false;
        }
      });
    });

    document.querySelectorAll(".comments-list").forEach((container) => {
      loadComments(container.dataset.commentsFor, container);
    });
  }

  async function loadComments(postId, container) {
    try {
      const data = await api(`/posts/${encodeURIComponent(postId)}/comments`);
      const comments = Array.isArray(data) ? data : (data?.comments || []);
      if (!comments.length) {
        container.innerHTML = '<div class="muted" style="font-size:12px">No comments yet. Be the first!</div>';
        return;
      }
      const currentId = String(state.user?.id ?? "");
      container.innerHTML = comments.map((comment) => {
        const commentId = escapeHtml(comment.id);
        const owner = String(comment.user_id ?? "") === currentId;
        return `<div class="comment"><strong>${escapeHtml(comment.email || "User")}</strong>${escapeHtml(comment.content || "")}${owner ? `<button class="comment-delete" data-id="${commentId}" title="Delete comment" aria-label="Delete comment">×</button>` : ""}</div>`;
      }).join("");
      container.querySelectorAll(".comment-delete").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!confirm("Delete this comment?")) return;
          button.disabled = true;
          try {
            await api(`/comments/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
            // Refresh only this post's comments, not the entire feed.
            await loadComments(postId, container);
          } catch (error) {
            showMessage(feedMessage, friendlyError(error), "error");
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      container.innerHTML = `<div class="muted" style="font-size:12px">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  function friendlyError(error) {
    const message = error?.message || "Something went wrong.";
    if (message.includes("Failed to fetch")) return "Could not reach the API. Check the backend URL, CORS settings, and whether the backend is online.";
    return message;
  }

  async function init() {
    if (!state.token) return setLoggedOutUI();
    try {
      await loadCurrentUser();
      setLoggedInUI();
    } catch {
      localStorage.removeItem("simple_social_token");
      state.token = null;
      state.user = null;
      setLoggedOutUI();
      showMessage(authMessage, "Please log in again to continue.", "info");
    }
  }
  init();
})();
