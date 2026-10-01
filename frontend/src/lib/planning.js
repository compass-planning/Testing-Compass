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
