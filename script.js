let currentPage = 1;
const pageSize = 5;
let sortField = "title";
let sortDirection = "asc";

const BUCKET = "job_descriptions";

document.addEventListener("DOMContentLoaded", async () => {
  const page = getPage();

  if (page !== "login.html") {
    await requireLogin();
  }

  if (page === "index.html" || page === "") {
    await loadJobs();
  }

  if (page === "edit.html") {
    await loadEditPage();
  }

  if (page === "viewer.html") {
    await loadViewer();
  }
});

function getPage() {
  return window.location.pathname.split("/").pop();
}

/* LOGIN */

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    document.getElementById("loginMessage").textContent = error.message;
    return;
  }

  localStorage.setItem("supabase_user_email", data.user.email);
  window.location.href = "index.html";
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("supabase_user_email");
  window.location.href = "login.html";
}

async function requireLogin() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    window.location.href = "login.html";
    return;
  }

  return data.session;
}

/* MAIN TABLE */

async function loadJobs() {
  const tbody = document.getElementById("jobTable");
  if (!tbody) return;

  const search = document.getElementById("searchBox")?.value.trim() || "";

  let query = supabaseClient
    .from("job_descriptions")
    .select("*", { count: "exact" })
    .eq("active", true)
    .order(sortField, { ascending: sortDirection === "asc" })
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (search !== "") {
    query = query.or(
      `code.ilike.%${search}%,title.ilike.%${search}%,keywords.ilike.%${search}%,file_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    alert(error.message);
    return;
  }

  tbody.innerHTML = "";

  data.forEach(job => {
    tbody.innerHTML += `
      <tr>
        <td>${job.code || ""}</td>
        <td>${job.title || ""}</td>
        <td>${job.file_name || ""}</td>
        <td>${formatDate(job.created_at)}<br>${formatDate(job.updated_at)}</td>
        <td>
          <div class="actions">
            <button class="icon-btn" onclick="viewFile('${job.id}')">👁️</button>
            <button class="icon-btn" onclick="downloadFile('${job.id}')">⬇️</button>
            <button class="icon-btn" onclick="editJob('${job.id}')">✏️</button>
            <button class="icon-btn" onclick="deleteJob('${job.id}')">❌</button>
          </div>
        </td>
      </tr>
    `;
  });

  const pages = Math.max(1, Math.ceil(count / pageSize));
  document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${pages}`;
}

function sortJobs(field) {
  if (sortField === field) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortField = field;
    sortDirection = "asc";
  }

  currentPage = 1;
  loadJobs();
}

function nextPage() {
  currentPage++;
  loadJobs();
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    loadJobs();
  }
}

/* EDIT / CREATE */

function editJob(id) {
  window.location.href = `edit.html?id=${id}`;
}

async function loadEditPage() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    document.getElementById("formTitle").textContent = "Create Job Description";
    return;
  }

  const { data, error } = await supabaseClient
    .from("job_descriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById("formTitle").textContent = "Edit Job Description";
  document.getElementById("code").value = data.code || "";
  document.getElementById("title").value = data.title || "";
  document.getElementById("keywords").value = data.keywords || "";
}

async function saveJob() {
  const session = await requireLogin();

  if (!session) {
    alert("You are not logged in.");
    return;
  }

  const id = new URLSearchParams(window.location.search).get("id");

  const code = document.getElementById("code").value.trim();
  const title = document.getElementById("title").value.trim();
  const keywords = document.getElementById("keywords").value.trim();
  const file = document.getElementById("fileInput").files[0];

  if (!code || !title) {
    alert("Code and Title are required.");
    return;
  }

  let record = {
    code: code,
    title: title,
    keywords: keywords,
    active: true,
    updated_at: new Date().toISOString()
  };

  if (file) {
    const cleanFileName = file.name.replaceAll(" ", "_");
    const filePath = `${code}/${Date.now()}_${cleanFileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) {
      alert("Upload error: " + uploadError.message);
      return;
    }

    record.file_name = file.name;
    record.file_path = filePath;
  }

  let result;

  if (id) {
    result = await supabaseClient
      .from("job_descriptions")
      .update(record)
      .eq("id", id);
  } else {
    result = await supabaseClient
      .from("job_descriptions")
      .insert([record]);
  }

  if (result.error) {
    console.log(result.error);
    alert(result.error.message);
    return;
  }

  window.location.href = "index.html";
}

/* VIEW / DOWNLOAD */

async function viewFile(id) {
  const { data, error } = await supabaseClient
    .from("job_descriptions")
    .select("file_path")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  if (!data.file_path) {
    alert("No PDF attached.");
    return;
  }

  const { data: signed, error: signedError } = await supabaseClient.storage
    .from(BUCKET)
    .createSignedUrl(data.file_path, 3600, {
      download: false
    });

  if (signedError) {
    alert(signedError.message);
    return;
  }

  window.open(signed.signedUrl, "_blank");
}

async function loadViewer() {
  const id = new URLSearchParams(window.location.search).get("id");

  const { data, error } = await supabaseClient
    .from("job_descriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  if (!data.file_path) {
    alert("No file attached.");
    window.location.href = "index.html";
    return;
  }

  const { data: signed, error: signedError } = await supabaseClient.storage
    .from(BUCKET)
    .createSignedUrl(data.file_path, 600);

  if (signedError) {
    alert(signedError.message);
    return;
  }

  document.getElementById("pdfViewer").src = signed.signedUrl;
}

async function downloadFile(id) {
  const { data, error } = await supabaseClient
    .from("job_descriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  if (!data.file_path) {
    alert("No file attached.");
    return;
  }

  const { data: signed, error: signedError } = await supabaseClient.storage
    .from(BUCKET)
    .createSignedUrl(data.file_path, 60);

  if (signedError) {
    alert(signedError.message);
    return;
  }

  const a = document.createElement("a");
  a.href = signed.signedUrl;
  a.download = data.file_name || "download.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* DELETE */

async function deleteJob(id) {
  if (!confirm("Delete this job description?")) return;

  const { error } = await supabaseClient
    .from("job_descriptions")
    .update({
      active: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadJobs();
}

/* HELPERS */

function formatDate(dateText) {
  if (!dateText) return "";

  const d = new Date(dateText);

  if (isNaN(d)) return "";

  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
