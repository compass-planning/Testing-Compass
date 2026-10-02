import api from "@/lib/api";

export const planApi = {
  list: (kind) => api.get(`/plan/${kind}`).then((r) => r.data),
  create: (kind, body) => api.post(`/plan/${kind}`, body).then((r) => r.data),
  update: (kind, id, body) => api.put(`/plan/${kind}/${id}`, body).then((r) => r.data),
  remove: (kind, id) => api.delete(`/plan/${kind}/${id}`).then((r) => r.data),
  overview: () => api.get(`/plan/overview`).then((r) => r.data),
  profile: () => api.get(`/plan/profile`).then((r) => r.data),
  saveProfile: (body) => api.put(`/plan/profile`, body).then((r) => r.data),
};

export const retirementApi = {
  projection: (body) => api.post(`/plan/retirement/projection`, body).then((r) => r.data),
  montecarlo: (body) => api.post(`/plan/retirement/montecarlo`, body).then((r) => r.data),
  guardrails: (body) => api.post(`/plan/retirement/guardrails`, body).then((r) => r.data),
  withdrawals: (body) => api.post(`/plan/retirement/withdrawals`, body).then((r) => r.data),
  cppTiming: (body) => api.post(`/plan/retirement/cpp-timing`, body).then((r) => r.data),
  rrspVsTfsa: (body) => api.post(`/plan/retirement/rrsp-vs-tfsa`, body).then((r) => r.data),
  pensionSplit: (body) => api.post(`/plan/retirement/pension-split`, body).then((r) => r.data),
  scenarios: () => api.get(`/plan/retirement/scenarios`).then((r) => r.data),
  saveScenario: (body) => api.post(`/plan/retirement/scenarios`, body).then((r) => r.data),
  removeScenario: (id) => api.delete(`/plan/retirement/scenarios/${id}`).then((r) => r.data),
};

export const protectionApi = {
  life: (body) => api.post(`/plan/protection/life`, body).then((r) => r.data),
  ltc: (body) => api.post(`/plan/protection/ltc`, body).then((r) => r.data),
  di: (body) => api.post(`/plan/protection/di`, body).then((r) => r.data),
};

export const docsApi = {
  list: () => api.get(`/plan/documents/files`).then((r) => r.data),
  upload: (form) => api.post(`/plan/documents/upload`, form).then((r) => r.data),
  remove: (id) => api.delete(`/plan/documents/files/${id}`).then((r) => r.data),
  downloadUrl: (id) => `/plan/documents/files/${id}/download`,
};

export const meetingsApi = {
  list: () => api.get(`/plan/meetings`).then((r) => r.data),
  transcribe: (form) => api.post(`/plan/meetings/transcribe`, form).then((r) => r.data),
  suggestTasks: (id) => api.post(`/plan/meetings/${id}/suggest-tasks`).then((r) => r.data),
  remove: (id) => api.delete(`/plan/meetings/${id}`).then((r) => r.data),
};

export const assumptionsApi = {
  get: () => api.get(`/plan/assumptions`).then((r) => r.data),
  save: (body) => api.put(`/plan/assumptions`, body).then((r) => r.data),
};

export const actionItemsApi = {
  list: () => api.get(`/plan/action-items`).then((r) => r.data),
};

export const educationApi = {
  resp: (body) => api.post(`/plan/education/resp`, body).then((r) => r.data),
};

export const enterpriseApi = {
  overview: () => api.get(`/enterprise/overview`).then((r) => r.data),
  household: (hid) => api.get(`/enterprise/household/${hid}`).then((r) => r.data),
  invite: (body) => api.post(`/enterprise/clients/invite`, body).then((r) => r.data),
};

export const crossBorderApi = {
  analyze: (body) => api.post(`/plan/crossborder`, body).then((r) => r.data),
  save: (body) => api.post(`/plan/crossborder/save`, body).then((r) => r.data),
  saved: () => api.get(`/plan/crossborder/saved`).then((r) => r.data),
};

