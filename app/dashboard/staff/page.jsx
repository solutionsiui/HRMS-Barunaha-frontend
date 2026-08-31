"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, backendAssetUrl } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtINR } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import PasswordInput from "@/components/ui/PasswordInput";
import Pagination from "@/components/ui/Pagination";
import { validateEmail, validateStrongPassword, validateBaseSalary, sanitizeNumericInput } from "@/lib/validators";

export default function StaffPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const canEditLeaveBalances = isAdmin || role === "hr";

  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [biometricRequests, setBiometricRequests] = useState([]);
  const [machineCandidates, setMachineCandidates] = useState([]);
  const [onlineDevice, setOnlineDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [quotaModal, setQuotaModal] = useState(null);
  const [quotaForm, setQuotaForm] = useState({ remaining_cl: 10, remaining_sl: 12, remaining_pl: 15, used_cl: 0, used_sl: 0, used_pl: 0, loading: false });
  const [form, setForm] = useState({
    username: "", password: "", first_name: "", last_name: "", email: "",
    emp_id: "", department_id: "", is_hr: false, is_accounts: false, is_hod: false, is_tl: false, is_superuser: false,
    machine_user_id: "", base_salary: "", hod_department_ids: [],
    hod_user_id: "", tl_user_id: "", system_no: "", is_night_shift: false,
    hod_user_ids: [], tl_user_ids: [], cl_quota: 10, sl_quota: 12, pl_quota: 15,
  });
  const [editForm, setEditForm] = useState({
    first_name: "", last_name: "", email: "", department: "", department_id: "",
    is_hr: false, is_accounts: false, is_hod: false, is_tl: false,
    machine_user_id: "", base_salary: "", bank_account: "", ifsc_code: "",
    new_password: "", is_active: true, hod_department_ids: [],
    hod_user_id: "", tl_user_id: "", system_no: "", is_night_shift: false,
    hod_user_ids: [], tl_user_ids: [], cl_quota: 10, sl_quota: 12, pl_quota: 15,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "active", "deactivated"
  const [bioFilter, setBioFilter] = useState("all"); // "all", "synced", "not_synced"
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 15;
  const [showToast, toastNode] = useToast();
  const [bankDetails, setBankDetails] = useState(null);
  const latestLoadIdRef = useRef(0);

  const getNextEmpId = (empId) => {
    if (!empId) return "";
    const match = empId.trim().match(/^([a-zA-Z_\-]+)?(\d+)$/);
    if (match) {
      const prefix = match[1] || "";
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + 1;
      const nextNumStr = String(nextNum).padStart(numStr.length, "0");
      return prefix + nextNumStr;
    }
    return empId;
  };

  const handleOpenAddModal = () => {
    let nextId = "";
    if (staff && staff.length > 0) {
      const lastEmp = staff.reduce((max, curr) => {
        if (!max) return curr;
        if (curr.id && max.id) {
          return curr.id > max.id ? curr : max;
        }
        return curr;
      }, null);
      if (lastEmp && lastEmp.emp_id) {
        nextId = getNextEmpId(lastEmp.emp_id);
      }
    }
    setForm({
      username: "", password: "", first_name: "", last_name: "", email: "",
      emp_id: nextId, department_id: "", is_hr: false, is_accounts: false, is_hod: false, is_tl: false,
      machine_user_id: "", base_salary: "", hod_department_ids: [],
      hod_user_id: "", tl_user_id: "", system_no: "", is_night_shift: false,
      hod_user_ids: [], tl_user_ids: [],
    });
    setShowModal(true);
  };

  function parseDepartmentId(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeDepartmentIds(values) {
    const seen = new Set();
    return (values || []).reduce((acc, value) => {
      const departmentId = parseDepartmentId(value);
      if (!departmentId || seen.has(departmentId)) return acc;
      seen.add(departmentId);
      acc.push(departmentId);
      return acc;
    }, []);
  }

  function withPrimaryDepartment(values, primaryDepartmentId) {
    const normalized = normalizeDepartmentIds(values);
    if (primaryDepartmentId && !normalized.includes(primaryDepartmentId)) {
      normalized.unshift(primaryDepartmentId);
    }
    return normalized;
  }

  function resolveOnlineDevice(devices) {
    return Array.isArray(devices) ? devices.find((device) => device.is_online) || null : null;
  }

  function resolveOnlineCommandDevice(devices) {
    return Array.isArray(devices)
      ? devices.find((device) => device.is_online) || null
      : null;
  }

  const load = useCallback(async () => {
    const currentLoadId = latestLoadIdRef.current + 1;
    latestLoadIdRef.current = currentLoadId;
    setLoading(true);
    try {
      const [employeesResult, departmentsResult, enrollmentResult, unmappedUsersResult, devicesResult] = await Promise.allSettled([
        apiFetch("/employees/"),
        apiFetch("/departments/"),
        isAdmin ? apiFetch("/api/devices/enrollment-requests/").catch(() => ({ requests: [] })) : Promise.resolve({ requests: [] }),
        isAdmin ? apiFetch("/api/devices/unmapped-users/").catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
        apiFetch("/api/devices/").catch(() => ({ devices: [] })),
      ]);
      if (currentLoadId !== latestLoadIdRef.current) return;
      if (employeesResult.status === "fulfilled") {
        setStaff(Array.isArray(employeesResult.value) ? employeesResult.value : []);
      }
      if (departmentsResult.status === "fulfilled") {
        setDepartments(Array.isArray(departmentsResult.value) ? departmentsResult.value : []);
      }
      if (enrollmentResult.status === "fulfilled") {
        setBiometricRequests(Array.isArray(enrollmentResult.value?.requests) ? enrollmentResult.value.requests : []);
      }
      if (unmappedUsersResult.status === "fulfilled") {
        setMachineCandidates(Array.isArray(unmappedUsersResult.value?.users) ? unmappedUsersResult.value.users : []);
      }
      if (devicesResult.status === "fulfilled") {
        setOnlineDevice(resolveOnlineDevice(devicesResult.value?.devices));
      }
    } catch {
      // keep previous state on transient fetch errors
    } finally {
      if (currentLoadId === latestLoadIdRef.current) {
        setLoading(false);
      }
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [requestResult, unmappedUsersResult, devicesResult] = await Promise.all([
          apiFetch("/api/devices/enrollment-requests/"),
          apiFetch("/api/devices/unmapped-users/").catch(() => ({ users: [] })),
          apiFetch("/api/devices/").catch(() => ({ devices: [] })),
        ]);
        if (stopped) return;
        setBiometricRequests(Array.isArray(requestResult?.requests) ? requestResult.requests : []);
        setMachineCandidates(Array.isArray(unmappedUsersResult?.users) ? unmappedUsersResult.users : []);
        setOnlineDevice(resolveOnlineDevice(devicesResult?.devices));
      } catch {
        // keep last known state on intermittent machine/network lag
      }
    };

    const timer = setInterval(poll, 7000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isAdmin]);

  async function addEmployee(e) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      showToast("First name is required", "error");
      return;
    }
    if (!form.last_name.trim()) {
      showToast("Last name is required", "error");
      return;
    }
    if (!form.username.trim()) {
      showToast("Username is required", "error");
      return;
    }
    if (!form.emp_id.trim()) {
      showToast("Employee ID is required", "error");
      return;
    }
    if (!form.department_id) {
      showToast("Department is required", "error");
      return;
    }
    if (!form.email.trim()) {
      showToast("Email is required", "error");
      return;
    }
    if ([form.is_hr, form.is_accounts, form.is_hod, form.is_tl, form.is_superuser].filter(Boolean).length > 1) {
      showToast("Select only one role for an employee", "error");
      return;
    }
    const pwdCheck = validateStrongPassword(form.password);
    if (!pwdCheck.valid) {
      showToast(pwdCheck.message, "error");
      return;
    }
    if (form.email && !validateEmail(form.email)) {
      showToast("Please enter a valid email address (e.g. user@organization.com)", "error");
      return;
    }
    if (form.base_salary !== "" && form.base_salary !== null && form.base_salary !== undefined) {
      const salCheck = validateBaseSalary(form.base_salary);
      if (!salCheck.valid) {
        showToast(salCheck.message, "error");
        return;
      }
    }
    try {
      const payload = {
        ...form,
        emp_id: form.emp_id.trim().toUpperCase(),
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        machine_user_id: form.machine_user_id.trim() || undefined,
        department_id: +form.department_id,
        hod_user_id: form.hod_user_ids && form.hod_user_ids.length > 0 ? Number(form.hod_user_ids[0]) : undefined,
        tl_user_id: form.tl_user_ids && form.tl_user_ids.length > 0 ? Number(form.tl_user_ids[0]) : undefined,
        hod_user_ids: (form.hod_user_ids || []).slice(0, 1).map(Number),
        tl_user_ids: (form.tl_user_ids || []).slice(0, 1).map(Number),
        hod_department_ids: form.is_hod
          ? withPrimaryDepartment(form.hod_department_ids, parseDepartmentId(form.department_id))
          : [],
        is_tl: !!form.is_tl,
        is_night_shift: !!form.is_night_shift,
        system_no: form.system_no.trim() || undefined,
        base_salary: +form.base_salary || 0,
        cl_quota: form.cl_quota !== "" && form.cl_quota !== null && form.cl_quota !== undefined ? Number(form.cl_quota) : 10,
        sl_quota: form.sl_quota !== "" && form.sl_quota !== null && form.sl_quota !== undefined ? Number(form.sl_quota) : 12,
        pl_quota: form.pl_quota !== "" && form.pl_quota !== null && form.pl_quota !== undefined ? Number(form.pl_quota) : 15,
      };
      await apiFetch("/employees/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Employee added!");
      setShowModal(false);
      setForm({
        username: "", password: "", first_name: "", last_name: "", email: "",
        emp_id: "", department_id: "", is_hr: false, is_accounts: false, is_hod: false, is_tl: false, is_superuser: false,
        machine_user_id: "", base_salary: "", hod_department_ids: [],
        hod_user_id: "", tl_user_id: "", system_no: "", is_night_shift: false,
        hod_user_ids: [], tl_user_ids: [], cl_quota: 10, sl_quota: 12, pl_quota: 15,
      });
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function updateEmployee(e) {
    e.preventDefault();
    if (!editModal) return;
    if (!(editForm.first_name || "").trim() || !(editForm.last_name || "").trim()) {
      showToast("First name and last name are required", "error");
      return;
    }
    if (!(editForm.email || "").trim()) {
      showToast("Email is required", "error");
      return;
    }
    if (!editForm.department_id) {
      showToast("Department is required", "error");
      return;
    }
    if (editForm.new_password) {
      const passwordCheck = validateStrongPassword(editForm.new_password);
      if (!passwordCheck.valid) {
        showToast(passwordCheck.message, "error");
        return;
      }
    }
    if (editForm.email && !validateEmail(editForm.email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    if ([editForm.is_hr, editForm.is_accounts, editForm.is_hod, editForm.is_tl].filter(Boolean).length > 1) {
      showToast("Select only one role for an employee", "error");
      return;
    }
    if (editForm.base_salary !== "") {
      const salaryCheck = validateBaseSalary(editForm.base_salary);
      if (!salaryCheck.valid) {
        showToast(salaryCheck.message, "error");
        return;
      }
    }
    if (editForm.ifsc_code && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(editForm.ifsc_code.trim())) {
      showToast("Enter a valid 11-character IFSC code", "error");
      return;
    }
    try {
      const parsedDepartmentId = editForm.department_id === "" || editForm.department_id === null || editForm.department_id === undefined
        ? undefined
        : Number(editForm.department_id);
      const parsedBaseSalary = editForm.base_salary === "" || editForm.base_salary === null || editForm.base_salary === undefined
        ? undefined
        : Number(editForm.base_salary);

      const payload = {
        first_name: (editForm.first_name ?? "").trim(),
        last_name: (editForm.last_name ?? "").trim(),
        email: (editForm.email ?? "").trim(),
        machine_user_id: (editForm.machine_user_id ?? "").trim(),
        department_id: Number.isFinite(parsedDepartmentId) ? parsedDepartmentId : undefined,
        hod_user_id: editForm.hod_user_ids && editForm.hod_user_ids.length > 0 ? Number(editForm.hod_user_ids[0]) : null,
        tl_user_id: editForm.tl_user_ids && editForm.tl_user_ids.length > 0 ? Number(editForm.tl_user_ids[0]) : null,
        hod_user_ids: (editForm.hod_user_ids || []).slice(0, 1).map(Number),
        tl_user_ids: (editForm.tl_user_ids || []).slice(0, 1).map(Number),
        hod_department_ids: !!editForm.is_hod
          ? withPrimaryDepartment(editForm.hod_department_ids, parsedDepartmentId)
          : [],
        is_hr: !!editForm.is_hr,
        is_accounts: !!editForm.is_accounts,
        is_hod: !!editForm.is_hod,
        is_tl: !!editForm.is_tl,
        is_night_shift: !!editForm.is_night_shift,
        system_no: (editForm.system_no ?? "").trim() || null,
        base_salary: Number.isFinite(parsedBaseSalary) ? parsedBaseSalary : undefined,
        bank_account: (editForm.bank_account ?? "").trim(),
        ifsc_code: (editForm.ifsc_code ?? "").trim(),
        cl_quota: editForm.cl_quota !== "" && editForm.cl_quota !== null && editForm.cl_quota !== undefined ? Number(editForm.cl_quota) : 10,
        sl_quota: editForm.sl_quota !== "" && editForm.sl_quota !== null && editForm.sl_quota !== undefined ? Number(editForm.sl_quota) : 12,
        pl_quota: editForm.pl_quota !== "" && editForm.pl_quota !== null && editForm.pl_quota !== undefined ? Number(editForm.pl_quota) : 15,
        new_password: editForm.new_password?.trim() || undefined,
        is_active: !!editForm.is_active,
      };

      if (payload.department_id === undefined) delete payload.department_id;
      if (payload.base_salary === undefined) delete payload.base_salary;
      if (!payload.new_password) delete payload.new_password;

      const result = await apiFetch(`/employees/${editModal.emp_id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast(result?.message || "Employee updated!");
      setEditModal(null);
      setSearch("");
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function uploadProfilePic(empId, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Select a valid image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Profile picture cannot exceed 5MB", "error");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await apiFetch(`/employees/${empId}/profile-pic`, {
        method: "POST",
        body: formData,
        headers: {}, // Let browser set multipart/form-data with boundary
      });
      showToast("Profile picture updated!");
      setEditModal((current) => current?.emp_id === empId ? { ...current, profile_pic: result?.url || current.profile_pic } : current);
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function registerBiometric(empId, action, extra = {}) {
    try {
      const { devices } = await apiFetch("/api/devices/");
      const online = resolveOnlineCommandDevice(devices);
      if (!online) {
        showToast("No ZKTeco device is online", "error");
        return;
      }

      await apiFetch("/api/devices/command/", {
        method: "POST",
        body: JSON.stringify({
          device_sn: online.serial_no,
          action,
          pin: empId,
          ...extra
        })
      });
      setSearch("");
      if (action === "enroll_face") {
        showToast(`Face request tracked. User sync and face-enroll command are queued for ${empId}. If firmware blocks remote face enroll, complete once on machine and portal will auto-sync from machine logs.`);
      } else {
        const label = action === "enroll_fp" ? "Fingerprint" : "Device";
        showToast(`${label} request queued. Ask the employee to complete it on the machine.`);
      }
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function deleteDeviceUser() {
    if (!editModal) return;
    const defaultDevicePin = (editForm.machine_user_id || editModal.machine_user_id || editModal.emp_id || "").trim();
    const devicePin = prompt("Enter the exact device user ID to delete from the machine (for example 2, 3, or HR01):", defaultDevicePin);
    if (devicePin === null) return;
    const cleaned = devicePin.trim();
    if (!cleaned) return;

    try {
      const { devices } = await apiFetch("/api/devices/");
      const online = resolveOnlineCommandDevice(devices);
      if (!online) {
        showToast("No ZKTeco device is online", "error");
        return;
      }

      await apiFetch("/api/devices/command/", {
        method: "POST",
        body: JSON.stringify({
          device_sn: online.serial_no,
          action: "delete_user",
          pin: cleaned,
        }),
      });
      showToast(`Delete request queued for device user ID ${cleaned}.`);
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function updateEnrollmentRequest(requestId, status) {
    let notes;
    if (status === "failed" || status === "cancelled") {
      const input = prompt("Add a note for this status (optional):", "");
      if (input === null) return;
      notes = input;
    }

    try {
      await apiFetch(`/api/devices/enrollment-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      });
      showToast(`Enrollment request marked ${status}.`);
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function resetBiometrics(empId, modality = "all") {
    const label = modality === "all" ? "all biometrics" : modality;
    if (!confirm(`Clear ${label} for ${empId} on the machine and reset portal status?`)) return;

    try {
      const { devices } = await apiFetch("/api/devices/");
      const online = resolveOnlineCommandDevice(devices);
      if (!online) {
        showToast("No ZKTeco device is online", "error");
        return;
      }

      const result = await apiFetch("/api/devices/command/", {
        method: "POST",
        body: JSON.stringify({
          device_sn: online.serial_no,
          action: "clear_biometrics",
          pin: empId,
          modality,
        }),
      });

      setSearch("");
      setEditModal((prev) => {
        if (!prev || prev.emp_id !== empId) return prev;
        return {
          ...prev,
          fingerprint_registered: modality === "face" ? prev.fingerprint_registered : false,
          face_registered: modality === "fingerprint" ? prev.face_registered : false,
        };
      });

      showToast(result?.message || `Biometric reset queued for ${empId}.`);
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function clearEnrollmentRequests({ onlyOpen = false, empId = null, includeCompleted = false } = {}) {
    const targetLabel = empId ? `for ${empId}` : "for all employees";
    const modeLabel = onlyOpen ? "open requests" : (includeCompleted ? "all request history" : "non-completed requests");
    if (!confirm(`Clear ${modeLabel} ${targetLabel}? This action removes rows from the portal table.`)) return;

    try {
      const query = new URLSearchParams();
      if (onlyOpen) query.set("only_open", "true");
      if (empId) query.set("emp_id", empId);
      if (includeCompleted) query.set("include_completed", "true");
      const suffix = query.toString() ? `?${query.toString()}` : "";

      const result = await apiFetch(`/api/devices/enrollment-requests/${suffix}`, {
        method: "DELETE",
      });
      setSearch("");
      showToast(result?.message || "Enrollment requests cleared.");
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  function openEdit(emp) {
    setBankDetails(null);
    setEditModal(emp);
    setEditForm({
      first_name:   emp.first_name  || "",
      last_name:    emp.last_name   || "",
      email:        emp.email       || "",
      department:   emp.department  || "",
      department_id: emp.department_id || "",
      is_hr:        emp.is_hr       || false,
      is_accounts:  emp.is_accounts || false,
      is_hod:       emp.is_hod      || false,
      is_tl:        emp.is_tl       || false,
      machine_user_id: emp.machine_user_id || "",
      hod_user_id:  emp.hod_user_id ? String(emp.hod_user_id) : "",
      tl_user_id:   emp.tl_user_id ? String(emp.tl_user_id) : "",
      hod_user_ids: emp.hod_user_ids ? emp.hod_user_ids.map(Number) : (emp.hod_user_id ? [Number(emp.hod_user_id)] : []),
      tl_user_ids:  emp.tl_user_ids ? emp.tl_user_ids.map(Number) : (emp.tl_user_id ? [Number(emp.tl_user_id)] : []),
      hod_department_ids: withPrimaryDepartment(emp.hod_department_ids || [], parseDepartmentId(emp.department_id)),
      system_no: emp.system_no || "",
      is_night_shift: emp.is_night_shift || false,
      base_salary:  emp.base_salary || "",
      bank_account: emp.bank_account || "",
      ifsc_code:    emp.ifsc_code   || "",
      cl_quota:     emp.cl_quota    ?? 10,
      sl_quota:     emp.sl_quota    ?? 12,
      pl_quota:     emp.pl_quota    ?? 15,
      fingerprint_registered: emp.fingerprint_registered || false,
      face_registered: emp.face_registered || false,
      card_number: emp.card_number || "",
      new_password: "",
      is_active:    emp.is_active   !== false,
    });
  }

  async function lookupIfsc() {
    const code = (editForm.ifsc_code || "").trim().toUpperCase();
    setEditForm((current) => ({ ...current, ifsc_code: code }));
    setBankDetails(null);
    if (!code) return;
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
      showToast("Enter a valid 11-character IFSC code", "error");
      return;
    }
    try {
      const details = await apiFetch(`/employees/bank-details/${code}`);
      setBankDetails(details);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function openQuotaEdit(emp) {
    setQuotaModal(emp);
    setQuotaForm({
      remaining_cl: 10, remaining_sl: 12, remaining_pl: 15,
      used_cl: 0, used_sl: 0, used_pl: 0,
      loading: true,
    });
    try {
      const b = await apiFetch(`/leave/balance?emp_id=${emp.emp_id}`);
      if (b && b.annual_quotas) {
        setQuotaForm({
          remaining_cl: b.annual_quotas.casual?.remaining ?? 10,
          remaining_sl: b.annual_quotas.sick?.remaining ?? 12,
          remaining_pl: b.annual_quotas.privileged?.remaining ?? 15,
          used_cl: b.annual_quotas.casual?.used ?? 0,
          used_sl: b.annual_quotas.sick?.used ?? 0,
          used_pl: b.annual_quotas.privileged?.used ?? 0,
          loading: false,
        });
      } else {
        setQuotaForm((f) => ({ ...f, loading: false }));
      }
    } catch {
      setQuotaForm((f) => ({ ...f, loading: false }));
    }
  }

  async function updateQuotas(e) {
    e.preventDefault();
    if (!quotaModal) return;
    try {
      const payload = {
        remaining_cl: quotaForm.remaining_cl !== "" && quotaForm.remaining_cl !== null ? Number(quotaForm.remaining_cl) : 0,
        remaining_sl: quotaForm.remaining_sl !== "" && quotaForm.remaining_sl !== null ? Number(quotaForm.remaining_sl) : 0,
        remaining_pl: quotaForm.remaining_pl !== "" && quotaForm.remaining_pl !== null ? Number(quotaForm.remaining_pl) : 0,
      };
      const result = await apiFetch(`/leave/quota/${quotaModal.emp_id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast(result?.message || "Remaining leave balances updated!");
      setQuotaModal(null);
      await load();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deactivate(empId) {
    if (!confirm("Deactivate this employee?")) return;
    try {
      await apiFetch(`/employees/${empId}`, { method: "DELETE" });
      showToast("Employee deactivated");
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function permanentlyDelete(empId) {
    if (!confirm("Permanently delete this inactive employee and all related records? This cannot be undone.")) return;
    try {
      await apiFetch(`/employees/${empId}/permanent`, { method: "DELETE" });
      showToast("Employee permanently deleted");
      await load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const filtered = staff.filter((s) => {
    // Status Filter (Active vs Deactivated)
    if (statusFilter === "active" && s.is_active === false) return false;
    if (statusFilter === "deactivated" && s.is_active !== false) return false;

    // Biometric Sync Filter
    const isBioSynced = Boolean(s.fingerprint_registered || s.face_registered);
    if (bioFilter === "synced" && !isBioSynced) return false;
    if (bioFilter === "not_synced" && isBioSynced) return false;

    // Search term
    if (search) {
      const term = search.toLowerCase();
      const nameMatch = `${s.first_name || ""} ${s.last_name || ""}`.toLowerCase().includes(term);
      const empIdMatch = (s.emp_id || "").toLowerCase().includes(term);
      const deptMatch = (s.department || "").toLowerCase().includes(term);
      return nameMatch || empIdMatch || deptMatch;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedStaff = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const rawHodOptions = useMemo(
    () => staff.filter((employee) => employee.is_hod || employee.is_superuser),
    [staff]
  );
  const rawTlOptions = useMemo(
    () => staff.filter((employee) => employee.is_tl),
    [staff]
  );

  const hodOptions = useMemo(() => {
    const activeDeptId = showModal ? form.department_id : (editModal ? editForm.department_id : "");
    if (!activeDeptId) return rawHodOptions;
    return rawHodOptions.filter((emp) => String(emp.department_id) === String(activeDeptId));
  }, [rawHodOptions, form.department_id, editForm.department_id, showModal, editModal]);

  const tlOptions = useMemo(() => {
    const activeDeptId = showModal ? form.department_id : (editModal ? editForm.department_id : "");
    if (!activeDeptId) return rawTlOptions;
    return rawTlOptions.filter((emp) => String(emp.department_id) === String(activeDeptId));
  }, [rawTlOptions, form.department_id, editForm.department_id, showModal, editModal]);
  const pendingBiometricCount = biometricRequests.filter((r) => ["queued", "sent"].includes(r.status)).length;
  const employeeRequestHistory = editModal ? biometricRequests.filter((r) => r.employee_emp_id === editModal.emp_id).slice(0, 4) : [];

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function modalityLabel(modality) {
    if (modality === "fingerprint") return "Fingerprint";
    if (modality === "face") return "Face";
    return modality || "Unknown";
  }

  function statusBadgeStyle(status) {
    if (status === "completed") return { background: "#10b98122", color: "#10b981" };
    if (status === "failed") return { background: "#ef444422", color: "#ef4444" };
    if (status === "cancelled") return { background: "#64748b22", color: "#94a3b8" };
    if (status === "sent") return { background: "#3b82f622", color: "#3b82f6" };
    return { background: "#f59e0b22", color: "#f59e0b" };
  }

  function roleBadges(employee) {
    if (employee.is_superuser) {
      return <span className="badge" style={{ background: "#ef444422", color: "#ef4444" }}>Admin</span>;
    }
    return (
      <>
        {employee.is_hr && <span className="badge" style={{ background: "#10b98122", color: "#10b981" }}>HR</span>}
        {employee.is_accounts && <span className="badge" style={{ background: "#f59e0b22", color: "#f59e0b" }}>Accounts</span>}
        {employee.is_hod && <span className="badge" style={{ background: "#8b5cf622", color: "#8b5cf6" }}>HOD</span>}
        {employee.is_tl && <span className="badge" style={{ background: "#14b8a622", color: "#14b8a6" }}>TL</span>}
        {!employee.is_hr && !employee.is_accounts && !employee.is_hod && !employee.is_tl && (
          <span className="badge" style={{ background: "#6366f122", color: "#6366f1" }}>Employee</span>
        )}
      </>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Employee Management</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {isAdmin ? "Admin View, Add, Edit, Delete, and Deactivate All Employees" : "HR can add employees; account management is handled by Admin"}
          </p>
        </div>
        <button className="btn-primary" onClick={handleOpenAddModal}>+ Add Employee</button>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="input" placeholder="🔍 Search by name, emp ID, or department…"
            autoComplete="off"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {search ? (
            <button className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => setSearch("")}>Clear</button>
          ) : null}
        </div>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: 18, paddingBottom: biometricRequests.length ? 8 : 18 }}>
            <div>
              <h3 className="syne" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Biometric Enrollment Requests</h3>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                {pendingBiometricCount} pending request{pendingBiometricCount === 1 ? "" : "s"} across connected devices.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={load}>Refresh</button>
              <button className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => clearEnrollmentRequests({ onlyOpen: true })}>Clear Open</button>
              <button className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => clearEnrollmentRequests()}>Clear Non-Completed</button>
              <button className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => clearEnrollmentRequests({ includeCompleted: true })}>Clear All</button>
            </div>
          </div>

          {loading ? <Loader /> : biometricRequests.length === 0 ? (
            <EmptyState icon="📟" title="No biometric requests yet" sub="Queued fingerprint and face enrollments will appear here for admin tracking." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Device</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Sent</th>
                    <th>Resolved</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {biometricRequests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{request.employee_name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{request.employee_emp_id}</div>
                      </td>
                      <td>{modalityLabel(request.modality)}</td>
                      <td><span className="chip">{request.device_sn}</span></td>
                      <td>
                        <span className="badge" style={statusBadgeStyle(request.status)}>
                          {request.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{formatDateTime(request.requested_at)}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>by {request.requested_by}</div>
                      </td>
                      <td>{formatDateTime(request.sent_at)}</td>
                      <td>
                        <div style={{ fontSize: 12 }}>{formatDateTime(request.resolved_at)}</div>
                        {request.resolution_source ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{request.resolution_source}</div> : null}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {["queued", "sent"].includes(request.status) ? (
                            <>
                              <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => updateEnrollmentRequest(request.id, "completed")}>Complete</button>
                              <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => updateEnrollmentRequest(request.id, "failed")}>Fail</button>
                              <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => updateEnrollmentRequest(request.id, "cancelled")}>Cancel</button>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>{request.notes || "Closed"}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Filters for Staff Table */}
      <div className="card" style={{ marginBottom: 16, padding: "14px 18px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* Status Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>Status:</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStatusFilter("all")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: statusFilter === "all" ? "var(--hover-bg)" : "transparent",
                color: statusFilter === "all" ? "var(--text)" : "var(--muted)",
                border: statusFilter === "all" ? "1px solid var(--accent)" : "1px solid transparent",
              }}
            >
              All ({staff.length})
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStatusFilter("active")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: statusFilter === "active" ? "rgba(16,185,129,0.15)" : "transparent",
                color: statusFilter === "active" ? "#10b981" : "var(--muted)",
                border: statusFilter === "active" ? "1px solid #10b981" : "1px solid transparent",
              }}
            >
              Active ({staff.filter((s) => s.is_active !== false).length})
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStatusFilter("deactivated")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: statusFilter === "deactivated" ? "rgba(239,68,68,0.15)" : "transparent",
                color: statusFilter === "deactivated" ? "#ef4444" : "var(--muted)",
                border: statusFilter === "deactivated" ? "1px solid #ef4444" : "1px solid transparent",
              }}
            >
              Deactivated ({staff.filter((s) => s.is_active === false).length})
            </button>
          </div>

          {/* Biometric Sync Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>Biometrics:</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setBioFilter("all")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: bioFilter === "all" ? "var(--hover-bg)" : "transparent",
                color: bioFilter === "all" ? "var(--text)" : "var(--muted)",
                border: bioFilter === "all" ? "1px solid var(--accent)" : "1px solid transparent",
              }}
            >
              All
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setBioFilter("synced")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: bioFilter === "synced" ? "rgba(0,200,150,0.15)" : "transparent",
                color: bioFilter === "synced" ? "#00C896" : "var(--muted)",
                border: bioFilter === "synced" ? "1px solid #00C896" : "1px solid transparent",
              }}
            >
              Synced ({staff.filter((s) => s.fingerprint_registered || s.face_registered).length})
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setBioFilter("not_synced")}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: bioFilter === "not_synced" ? "rgba(245,158,11,0.15)" : "transparent",
                color: bioFilter === "not_synced" ? "#f59e0b" : "var(--muted)",
                border: bioFilter === "not_synced" ? "1px solid #f59e0b" : "1px solid transparent",
              }}
            >
              Not Synced ({staff.filter((s) => !s.fingerprint_registered && !s.face_registered).length})
            </button>
          </div>
        </div>

        {(statusFilter !== "all" || bioFilter !== "all") && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setStatusFilter("all");
              setBioFilter("all");
            }}
            style={{ padding: "5px 10px", fontSize: 12, color: "var(--muted)" }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? <Loader /> : filtered.length === 0 ? <EmptyState icon="👥" title="No employees found" /> : (
          <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>EMP ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Role</th>
                  {isAdmin && <th>Salary</th>}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStaff.map((e) => (
                  <tr key={e.emp_id}>
                    <td>
                      <span className="chip">{e.emp_id}</span>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                        Machine: {e.machine_user_id || "Not linked"}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{e.first_name} {e.last_name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>@{e.username}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                        System: {e.system_no || "Not set"} · Shift: {e.is_night_shift ? "Night" : "Day"}
                      </div>
                    </td>
                    <td>{e.department}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {roleBadges(e)}
                      </div>
                    </td>
                    {isAdmin && <td>{fmtINR(e.base_salary)}</td>}
                    <td>
                      <span className="badge" style={{ background: e.is_active ? "#10b98122" : "#ef444422", color: e.is_active ? "#10b981" : "#ef4444" }}>
                        {e.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {canEditLeaveBalances && (
                          <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openQuotaEdit(e)}>
                            🌴 Leave Balance
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(e)}>
                            ✏️ Edit
                          </button>
                        )}
                        {isAdmin && e.is_active && e.user_id !== user?.id && (
                          <button className="btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => deactivate(e.emp_id)}>
                            Deactivate
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => permanentlyDelete(e.emp_id)}>
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={safePage}
            totalItems={filtered.length}
            pageSize={PER_PAGE}
            onPageChange={(page) => setCurrentPage(page)}
          />
          </>
        )}
      </div>

      {/* ── Add Employee Modal ── */}
      {showModal && (
        <Modal className="modal-wide" title="Add New Employee" onClose={() => setShowModal(false)}
          footer={<>
            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={addEmployee}>Add Employee</button>
          </>}>
          <div className="form-row staff-form-grid">
            {/* Dummy inputs to prevent Chrome autofill */}
            <input type="text" name="chrome-autofill-dummy-username" style={{ position: "absolute", top: -1000, left: -1000, width: 1, height: 1, opacity: 0 }} tabIndex={-1} readOnly />
            <input type="password" name="chrome-autofill-dummy-password" style={{ position: "absolute", top: -1000, left: -1000, width: 1, height: 1, opacity: 0 }} tabIndex={-1} readOnly />
            <div className="form-group"><label className="label">First Name <span style={{ color: "#ef4444" }}>*</span></label><input className="input" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">Last Name <span style={{ color: "#ef4444" }}>*</span></label><input className="input" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">Username <span style={{ color: "#ef4444" }}>*</span></label><input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">Password <span style={{ color: "#ef4444" }}>*</span> <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>(min 8 chars, 1 uppercase, 1 digit, 1 special)</span></label><PasswordInput autoComplete="new-password" name="staff_create_password_no_autofill" minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">Employee ID <span style={{ color: "#ef4444" }}>*</span></label><input className="input" placeholder="EMP005" value={form.emp_id} onChange={(e) => setForm((f) => ({ ...f, emp_id: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">Machine User ID</label><input className="input" placeholder="Leave blank to use Employee ID for ZKTeco" value={form.machine_user_id} onChange={(e) => setForm((f) => ({ ...f, machine_user_id: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Department <span style={{ color: "#ef4444" }}>*</span></label><select className="input" value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, hod_department_ids: f.is_hod ? withPrimaryDepartment(f.hod_department_ids, parseDepartmentId(e.target.value)) : f.hod_department_ids }))} required><option value="">Select department…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div className="form-group"><label className="label">Email <span style={{ color: "#ef4444" }}>*</span></label><input className="input" type="email" placeholder="user@organization.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="label">Reports To HODs</label>
              <div style={{
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                backgroundColor: "rgba(255,255,255,0.02)"
              }}>
                {hodOptions.map((employee) => {
                  const id = Number(employee.user_id || employee.id);
                  const isChecked = (form.hod_user_ids || []).includes(id);
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            hod_user_ids: e.target.checked
                              ? [id]
                              : (f.hod_user_ids || []).filter((item) => item !== id)
                          }));
                        }}
                      />
                      <span>{employee.first_name} {employee.last_name} ({employee.emp_id})</span>
                    </label>
                  );
                })}
                {hodOptions.length === 0 && <span style={{ color: "var(--muted)", fontSize: "12px" }}>No HODs available for selected department</span>}
              </div>
            </div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="label">Reports To TLs</label>
              <div style={{
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                backgroundColor: "rgba(255,255,255,0.02)"
              }}>
                {tlOptions.map((employee) => {
                  const id = Number(employee.user_id || employee.id);
                  const isChecked = (form.tl_user_ids || []).includes(id);
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            tl_user_ids: e.target.checked
                              ? [id]
                              : (f.tl_user_ids || []).filter((item) => item !== id)
                          }));
                        }}
                      />
                      <span>{employee.first_name} {employee.last_name} ({employee.emp_id})</span>
                    </label>
                  );
                })}
                {tlOptions.length === 0 && <span style={{ color: "var(--muted)", fontSize: "12px" }}>No TLs available for selected department</span>}
              </div>
            </div>
            <div className="form-group">
              <label className="label">System No.</label>
              <input
                className="input"
                placeholder="Numeric system number"
                value={form.system_no}
                onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); }}
                onChange={(e) => setForm((f) => ({ ...f, system_no: e.target.value }))}
              />
            </div>
            {isAdmin && (
              <div className="form-group">
                <label className="label">Base Salary (₹)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="10000000"
                  placeholder="e.g. 35000"
                  value={form.base_salary}
                  onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9.]/g, ""); }}
                  onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="label">Work Shift</label>
              <select
                className="input"
                value={form.is_night_shift ? "night" : "day"}
                onChange={(e) => setForm((f) => ({ ...f, is_night_shift: e.target.value === "night" }))}
              >
                <option value="day">☀️ Day Shift</option>
                <option value="night">🌙 Night Shift</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 8, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div className="label" style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "var(--primary)" }}>🌴 Annual Leave Quotas</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                <div className="form-group"><label className="label">Casual Leave (CL)</label><input className="input" type="number" min="0" value={form.cl_quota} onChange={(e) => setForm((f) => ({ ...f, cl_quota: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Sick Leave (SL)</label><input className="input" type="number" min="0" value={form.sl_quota} onChange={(e) => setForm((f) => ({ ...f, sl_quota: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Privileged Leave (PL)</label><input className="input" type="number" min="0" value={form.pl_quota} onChange={(e) => setForm((f) => ({ ...f, pl_quota: e.target.value }))} /></div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={!form.is_hr && !form.is_accounts && !form.is_hod && !form.is_tl && !form.is_superuser} disabled /> Employee Role
            </label>
            {isAdmin && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={form.is_hr} onChange={(e) => setForm((f) => ({ ...f, is_hr: e.target.checked, is_accounts: false, is_hod: false, is_tl: false, is_superuser: false }))} /> HR Role</label>}
            {isAdmin && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={form.is_accounts} onChange={(e) => setForm((f) => ({ ...f, is_accounts: e.target.checked, is_hr: false, is_hod: false, is_tl: false, is_superuser: false }))} /> Accounts Role</label>}
            {isAdmin && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={form.is_hod} onChange={(e) => setForm((f) => ({ ...f, is_hod: e.target.checked, is_hr: false, is_accounts: false, is_tl: false, is_superuser: false, hod_department_ids: e.target.checked ? withPrimaryDepartment(f.hod_department_ids, parseDepartmentId(f.department_id)) : f.hod_department_ids }))} /> HOD Role</label>}
            {isAdmin && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={form.is_tl} onChange={(e) => setForm((f) => ({ ...f, is_tl: e.target.checked, is_hr: false, is_accounts: false, is_hod: false, is_superuser: false }))} /> TL Role</label>}
            {isAdmin && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={form.is_superuser || false} onChange={(e) => setForm((f) => ({ ...f, is_superuser: e.target.checked, is_hr: false, is_accounts: false, is_hod: false, is_tl: false }))} /> Admin / Manager Role</label>}
          </div>
          {form.is_hod && (
            <div style={{ marginTop: 18 }}>
              <div className="label" style={{ marginBottom: 6 }}>Managed Departments</div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Select every department this HOD can manage. The primary department stays included automatically.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
                {departments.map((department) => {
                  const primaryDepartmentId = parseDepartmentId(form.department_id);
                  const selectedDepartmentIds = withPrimaryDepartment(form.hod_department_ids, primaryDepartmentId);
                  const isPrimary = primaryDepartmentId === department.id;
                  const isChecked = selectedDepartmentIds.includes(department.id);
                  return (
                    <label key={department.id} className="card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isPrimary}
                        onChange={(e) => setForm((f) => {
                          const nextIds = e.target.checked
                            ? [...f.hod_department_ids, department.id]
                            : f.hod_department_ids.filter((id) => id !== department.id);
                          return {
                            ...f,
                            hod_department_ids: withPrimaryDepartment(nextIds, parseDepartmentId(f.department_id)),
                          };
                        })}
                      />
                      <div style={{ display: "grid", gap: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{department.name}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>{isPrimary ? "Primary department" : "Additional HOD scope"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Admin Edit Employee Modal ── */}
      {editModal && isAdmin && (
        <Modal className="modal-wide" title={`Edit: ${editModal.first_name} ${editModal.last_name} (${editModal.emp_id})`}
          onClose={() => {
            setEditModal(null);
            setSearch("");
          }}
          footer={<>
            <button className="btn-ghost" onClick={() => {
              setEditModal(null);
              setSearch("");
            }}>Cancel</button>
            <button className="btn-primary" onClick={updateEmployee}>Save Changes</button>
          </>}>
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
            ⚠️ Admin changes take effect immediately. Role changes will apply on the user&apos;s next login.
          </div>

          <div className="form-row staff-form-grid">
            {/* Dummy inputs to prevent Chrome autofill */}
            <input type="text" name="chrome-autofill-dummy-username" style={{ position: "absolute", top: -1000, left: -1000, width: 1, height: 1, opacity: 0 }} tabIndex={-1} readOnly />
            <input type="password" name="chrome-autofill-dummy-password" style={{ position: "absolute", top: -1000, left: -1000, width: 1, height: 1, opacity: 0 }} tabIndex={-1} readOnly />
            <div className="form-group"><label className="label">First Name <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required placeholder="Enter first name" value={editForm.first_name} onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Last Name <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required placeholder="Enter last name" value={editForm.last_name} onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Email <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required placeholder="user@organization.com" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Machine User ID</label><input className="input" placeholder="Leave blank to use Employee ID for ZKTeco" value={editForm.machine_user_id} onChange={(e) => setEditForm((f) => ({ ...f, machine_user_id: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Department <span style={{ color: "#ef4444" }}>*</span></label><select className="input" required value={editForm.department_id} onChange={(e) => setEditForm((f) => ({ ...f, department_id: e.target.value, department: departments.find((d) => d.id === +e.target.value)?.name || "", hod_department_ids: f.is_hod ? withPrimaryDepartment(f.hod_department_ids, parseDepartmentId(e.target.value)) : f.hod_department_ids }))}><option value="">Select department…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            {!editModal.is_superuser && !editModal.is_hod ? <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="label">Reports To HODs</label>
              <div style={{
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                backgroundColor: "rgba(255,255,255,0.02)"
              }}>
                {hodOptions.map((employee) => {
                  const id = Number(employee.user_id || employee.id);
                  const isChecked = (editForm.hod_user_ids || []).includes(id);
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setEditForm((f) => ({
                            ...f,
                            hod_user_ids: e.target.checked
                              ? [id]
                              : (f.hod_user_ids || []).filter((item) => item !== id)
                          }));
                        }}
                      />
                      <span>{employee.first_name} {employee.last_name} ({employee.emp_id})</span>
                    </label>
                  );
                })}
                {hodOptions.length === 0 && <span style={{ color: "var(--muted)", fontSize: "12px" }}>No HODs available</span>}
              </div>
            </div> : null}
            {!editModal.is_superuser && !editModal.is_hod && !editModal.is_tl ? <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="label">Reports To TLs</label>
              <div style={{
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                backgroundColor: "rgba(255,255,255,0.02)"
              }}>
                {tlOptions.map((employee) => {
                  const id = Number(employee.user_id || employee.id);
                  const isChecked = (editForm.tl_user_ids || []).includes(id);
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setEditForm((f) => ({
                            ...f,
                            tl_user_ids: e.target.checked
                              ? [id]
                              : (f.tl_user_ids || []).filter((item) => item !== id)
                          }));
                        }}
                      />
                      <span>{employee.first_name} {employee.last_name} ({employee.emp_id})</span>
                    </label>
                  );
                })}
                {tlOptions.length === 0 && <span style={{ color: "var(--muted)", fontSize: "12px" }}>No TLs available</span>}
              </div>
            </div> : null}
            <div className="form-group"><label className="label">System No.</label><input className="input" inputMode="numeric" placeholder="Digits only" value={editForm.system_no} onChange={(e) => setEditForm((f) => ({ ...f, system_no: e.target.value.replace(/[^0-9]/g, "") }))} /></div>
            <div className="form-group"><label className="label">Shift Type</label><select className="input" value={editForm.is_night_shift ? "night" : "day"} onChange={(e) => setEditForm((f) => ({ ...f, is_night_shift: e.target.value === "night" }))}><option value="day">Day Shift</option><option value="night">Night Shift</option></select></div>
            {isAdmin && <div className="form-group"><label className="label">Base Salary (₹)</label><input className="input" type="number" min="0" max="10000000" placeholder="0 - 1,00,00,000" value={editForm.base_salary} onChange={(e) => setEditForm((f) => ({ ...f, base_salary: sanitizeNumericInput(e.target.value, true) }))} /></div>}
            <div className="form-group"><label className="label">Bank Account</label><input className="input" inputMode="numeric" placeholder="Account number (digits only)" value={editForm.bank_account} onChange={(e) => setEditForm((f) => ({ ...f, bank_account: e.target.value.replace(/[^0-9]/g, "") }))} /></div>
            <div className="form-group"><label className="label">IFSC Code</label><input className="input" maxLength={11} placeholder="e.g. HDFC0001234" value={editForm.ifsc_code} onChange={(e) => { setBankDetails(null); setEditForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })); }} onBlur={lookupIfsc} />{bankDetails ? <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}><strong style={{ color: "var(--text)" }}>{bankDetails.bank}</strong><br />{bankDetails.branch}{bankDetails.city ? ` · ${bankDetails.city}` : ""}{bankDetails.state ? ` · ${bankDetails.state}` : ""}</div> : null}</div>
            <div className="form-group"><label className="label">Reset Password (leave blank to keep)</label><PasswordInput autoComplete="new-password" name="staff_reset_password_no_autofill" minLength={8} placeholder="8+ chars, uppercase, digit, special" value={editForm.new_password} onChange={(e) => setEditForm((f) => ({ ...f, new_password: e.target.value }))} /></div>

            <div style={{ gridColumn: "1 / -1", marginTop: 8, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div className="label" style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "var(--primary)" }}>🌴 Annual Leave Quotas (Editable by HR / Admin)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                <div className="form-group"><label className="label">Casual Leave (CL)</label><input className="input" type="number" min="0" value={editForm.cl_quota} onChange={(e) => setEditForm((f) => ({ ...f, cl_quota: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Sick Leave (SL)</label><input className="input" type="number" min="0" value={editForm.sl_quota} onChange={(e) => setEditForm((f) => ({ ...f, sl_quota: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Privileged Leave (PL)</label><input className="input" type="number" min="0" value={editForm.pl_quota} onChange={(e) => setEditForm((f) => ({ ...f, pl_quota: e.target.value }))} /></div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 20 }}>
            <div>
              <h4 className="syne" style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🖼️ Profile Picture</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: "var(--hover-bg)", backgroundSize: "cover", backgroundImage: editModal.profile_pic ? `url(${backendAssetUrl(editModal.profile_pic)})` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {!editModal.profile_pic && "👤"}
                </div>
                <input type="file" accept="image/*" onChange={(e) => uploadProfilePic(editModal.emp_id, e.target.files[0])} style={{ fontSize: 12 }} />
              </div>
            </div>

            {isAdmin ? (
            <div>
              <h4 className="syne" style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📟 Device Registration</h4>
              {machineCandidates.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <label className="label" style={{ marginBottom: 6 }}>Detected From Machine</label>
                  <select
                    className="input"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setEditForm((current) => ({ ...current, machine_user_id: e.target.value }));
                    }}
                  >
                    <option value="">Select an unmapped machine ID…</option>
                    {machineCandidates.map((candidate) => (
                      <option key={candidate.machine_user_id} value={candidate.machine_user_id}>
                        {candidate.machine_user_id} · {candidate.punch_count || candidate.event_count} event(s){candidate.last_device_sn ? ` · ${candidate.last_device_sn}` : ""}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    Pick a detected machine ID to link it with this employee. Any stored unmatched punches for that ID will be recovered on save.
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => registerBiometric(editModal.emp_id, "enroll_fp")}>☝️ Fingerprint</button>
                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => registerBiometric(editModal.emp_id, "enroll_face")}>🎭 Face Sync</button>
                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => resetBiometrics(editModal.emp_id, "all")}>♻️ Reset Biometrics</button>
                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={deleteDeviceUser}>🧹 Delete Device ID</button>
                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => clearEnrollmentRequests({ empId: editModal.emp_id })}>🗑️ Clear Request Rows</button>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {employeeRequestHistory.length > 0 ? employeeRequestHistory.map((request) => (
                  <span key={request.id} className="badge" style={statusBadgeStyle(request.status)}>
                    {modalityLabel(request.modality)}: {request.status}
                  </span>
                )) : (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>No biometric requests tracked yet for this employee.</span>
                )}
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                <div>Portal Employee ID: <strong style={{ color: "var(--text)" }}>{editModal.emp_id}</strong></div>
                <div>Linked Machine User ID: <strong style={{ color: "var(--text)" }}>{editForm.machine_user_id || editModal.machine_user_id || "Not linked yet"}</strong></div>
                <div>Fingerprint: <strong style={{ color: "var(--text)" }}>{editModal.fingerprint_registered ? "Enrolled on machine" : "Blank in portal"}</strong></div>
                <div>Face: <strong style={{ color: "var(--text)" }}>{editModal.face_registered ? "Enrolled on machine" : "Blank in portal"}</strong></div>
                <div>Card: <strong style={{ color: "var(--text)" }}>{editModal.card_number || "Blank in portal"}</strong></div>
                <div style={{ fontSize: 11 }}>
                  For ZKTeco, leaving Machine User ID blank makes the portal use the Employee ID exactly like the working HRMS-FastAPI-Nextjs flow. Set a separate Machine User ID only when the device already uses a different pin.
                </div>
              </div>
            </div>
            ) : null}
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />

          {!editModal.is_superuser ? <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 4, marginBottom: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={editForm.is_hr} onChange={(e) => setEditForm((f) => ({ ...f, is_hr: e.target.checked, is_accounts: false, is_hod: false, is_tl: false }))} /> HR Role</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={editForm.is_accounts} onChange={(e) => setEditForm((f) => ({ ...f, is_accounts: e.target.checked, is_hr: false, is_hod: false, is_tl: false }))} /> Accounts</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={editForm.is_hod} onChange={(e) => setEditForm((f) => ({ ...f, is_hod: e.target.checked, is_hr: false, is_accounts: false, is_tl: false, hod_department_ids: e.target.checked ? withPrimaryDepartment(f.hod_department_ids, parseDepartmentId(f.department_id)) : f.hod_department_ids }))} /> HOD</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={editForm.is_tl} onChange={(e) => setEditForm((f) => ({ ...f, is_tl: e.target.checked, is_hr: false, is_accounts: false, is_hod: false }))} /> TL</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active</label>
          </div> : null}
          {editForm.is_hod && (
            <div style={{ marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 6 }}>Managed Departments</div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Select all departments this HOD should manage. The employee&apos;s primary department is always kept in scope.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
                {departments.map((department) => {
                  const primaryDepartmentId = parseDepartmentId(editForm.department_id);
                  const selectedDepartmentIds = withPrimaryDepartment(editForm.hod_department_ids, primaryDepartmentId);
                  const isPrimary = primaryDepartmentId === department.id;
                  const isChecked = selectedDepartmentIds.includes(department.id);
                  return (
                    <label key={department.id} className="card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isPrimary}
                        onChange={(e) => setEditForm((f) => {
                          const nextIds = e.target.checked
                            ? [...f.hod_department_ids, department.id]
                            : f.hod_department_ids.filter((id) => id !== department.id);
                          return {
                            ...f,
                            hod_department_ids: withPrimaryDepartment(nextIds, parseDepartmentId(f.department_id)),
                          };
                        })}
                      />
                      <div style={{ display: "grid", gap: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{department.name}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>{isPrimary ? "Primary department" : "Additional HOD scope"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── HR Edit Remaining Leaves Modal ── */}
      {quotaModal && (
        <Modal title={`Edit Remaining Leaves: ${quotaModal.first_name} ${quotaModal.last_name} (${quotaModal.emp_id})`}
          onClose={() => setQuotaModal(null)}
          footer={<>
            <button className="btn-ghost" onClick={() => setQuotaModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={updateQuotas} disabled={quotaForm.loading}>Save Remaining Leaves</button>
          </>}>
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#6ee7b7" }}>
            🌴 Set the <strong>remaining leaves</strong> left for this employee. The total annual quota will automatically adjust based on approved leaves used this year.
          </div>
          {quotaForm.loading ? <Loader /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <div className="form-group">
                <label className="label">Remaining Casual Leaves (CL)</label>
                <input className="input" type="number" min="0" value={quotaForm.remaining_cl} onChange={(e) => setQuotaForm((f) => ({ ...f, remaining_cl: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Used this year: {quotaForm.used_cl} days</div>
              </div>
              <div className="form-group">
                <label className="label">Remaining Sick Leaves (SL)</label>
                <input className="input" type="number" min="0" value={quotaForm.remaining_sl} onChange={(e) => setQuotaForm((f) => ({ ...f, remaining_sl: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Used this year: {quotaForm.used_sl} days</div>
              </div>
              <div className="form-group">
                <label className="label">Remaining Privileged Leaves (PL)</label>
                <input className="input" type="number" min="0" value={quotaForm.remaining_pl} onChange={(e) => setQuotaForm((f) => ({ ...f, remaining_pl: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Used this year: {quotaForm.used_pl} days</div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {toastNode}
    </div>
  );
}
