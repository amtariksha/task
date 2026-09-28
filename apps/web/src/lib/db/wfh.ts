// MySQL WFH Applications Service
// Server-side only - do not use 'use client'

import { query, queryOne, withRetry, execute } from './config'
import { WFHApplication } from '../types'
interface WFHRow  {
  id: number
  application_id: string
  employee_id: string
  employee_name: string
  wfh_type: string
  reason: string
  from_date: string
  to_date: string
  work_location: string
  available_from: string | null
  available_to: string | null
  contact_number: string
  status: string
  manager_id: string | null
  approved_by: string | null
  approval_date: string | null
  approval_remarks: string | null
  created_at: string
  updated_at: string
}

// Convert database row to WFHApplication object
function rowToWFH(row: WFHRow): WFHApplication {
  return {
    id: row.application_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    wfhType: row.wfh_type as WFHApplication['wfhType'],
    reason: row.reason,
    fromDate: row.from_date,
    toDate: row.to_date,
    workLocation: row.work_location,
    availableFrom: row.available_from || undefined,
    availableTo: row.available_to || undefined,
    contactNumber: row.contact_number,
    status: row.status as WFHApplication['status'],
    managerId: row.manager_id || undefined,
    approvedBy: row.approved_by || undefined,
    approvalDate: row.approval_date || undefined,
    approvalRemarks: row.approval_remarks || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// Get all WFH applications
export async function getAllWFH(): Promise<WFHApplication[]> {
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications ORDER BY created_at DESC'
    )
    return rows.map(rowToWFH)
  })
}

/**
 * WFH applications for a set of employees. The list route used getAllWFH, which
 * returned every application in every company to any signed-in user.
 */
export async function getWFHForEmployees(employeeIds: string[]): Promise<WFHApplication[]> {
  if (employeeIds.length === 0) return []
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications WHERE employee_id = ANY($1) ORDER BY created_at DESC',
      [employeeIds]
    )
    return rows.map(rowToWFH)
  })
}

// Get WFH by ID
export async function getWFHById(id: string): Promise<WFHApplication | null> {
  return withRetry(async () => {
    const row = await queryOne<WFHRow>(
      'SELECT * FROM wfh_applications WHERE application_id = $1',
      [id]
    )
    return row ? rowToWFH(row) : null
  })
}

// Get WFH applications by employee ID
export async function getWFHByEmployeeId(employee_id: string): Promise<WFHApplication[]> {
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications WHERE employee_id = $1 ORDER BY created_at DESC',
      [employee_id]
    )
    return rows.map(rowToWFH)
  })
}

// Get WFH applications by manager ID
export async function getWFHByManagerId(managerId: string): Promise<WFHApplication[]> {
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications WHERE manager_id = $1 ORDER BY created_at DESC',
      [managerId]
    )
    return rows.map(rowToWFH)
  })
}

// Get WFH applications by status
export async function getWFHByStatus(status: WFHApplication['status']): Promise<WFHApplication[]> {
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications WHERE status = $1 ORDER BY created_at DESC',
      [status]
    )
    return rows.map(rowToWFH)
  })
}

// Get pending WFH for manager
export async function getPendingWFHForManager(managerId: string): Promise<WFHApplication[]> {
  return withRetry(async () => {
    const rows = await query<WFHRow[]>(
      'SELECT * FROM wfh_applications WHERE manager_id = $1 AND status = $2 ORDER BY created_at',
      [managerId, 'Pending']
    )
    return rows.map(rowToWFH)
  })
}

// Create WFH application
export async function createWFH(wfh: Omit<WFHApplication, 'createdAt' | 'updatedAt'>): Promise<WFHApplication> {
  return withRetry(async () => {
    await query<any>(
      `INSERT INTO wfh_applications (
        application_id, employee_id, employee_name, wfh_type, reason,
        from_date, to_date, work_location, available_from, available_to,
        contact_number, status, manager_id, approved_by, approval_date,
        approval_remarks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        wfh.id,
        wfh.employeeId,
        wfh.employeeName,
        wfh.wfhType,
        wfh.reason,
        wfh.fromDate,
        wfh.toDate,
        wfh.workLocation,
        wfh.availableFrom || null,
        wfh.availableTo || null,
        wfh.contactNumber,
        wfh.status,
        wfh.managerId || null,
        wfh.approvedBy || null,
        wfh.approvalDate || null,
        wfh.approvalRemarks || null
      ]
    )

    const createdWFH = await getWFHById(wfh.id)
    if (!createdWFH) {
      throw new Error('Failed to retrieve created WFH application')
    }
    return createdWFH
  })
}

// Update WFH application
export async function updateWFH(id: string, updates: Partial<WFHApplication>): Promise<WFHApplication> {
  return withRetry(async () => {
    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`)
      values.push(updates.status)
    }
    if (updates.approvedBy !== undefined) {
      fields.push(`approved_by = $${paramIndex++}`)
      values.push(updates.approvedBy || null)
    }
    if (updates.approvalDate !== undefined) {
      fields.push(`approval_date = $${paramIndex++}`)
      values.push(updates.approvalDate || null)
    }
    if (updates.approvalRemarks !== undefined) {
      fields.push(`approval_remarks = $${paramIndex++}`)
      values.push(updates.approvalRemarks || null)
    }

    if (fields.length === 0) {
      const wfh = await getWFHById(id)
      if (!wfh) throw new Error('WFH application not found')
      return wfh
    }

    values.push(id)
    await query(
      `UPDATE wfh_applications SET ${fields.join(', ')} WHERE application_id = $${paramIndex}`,
      values
    )

    const updatedWFH = await getWFHById(id)
    if (!updatedWFH) {
      throw new Error('Failed to retrieve updated WFH application')
    }
    return updatedWFH
  })
}

// Approve WFH
export async function approveWFH(id: string, approvedBy: string, remarks?: string): Promise<WFHApplication> {
  return updateWFH(id, {
    status: 'Approved',
    approvedBy,
    approvalDate: new Date().toISOString(),
    approvalRemarks: remarks
  })
}

// Reject WFH
export async function rejectWFH(id: string, rejectedBy: string, remarks?: string): Promise<WFHApplication> {
  return updateWFH(id, {
    status: 'Rejected',
    approvedBy: rejectedBy,
    approvalDate: new Date().toISOString(),
    approvalRemarks: remarks
  })
}

// Delete WFH application
export async function deleteWFH(id: string): Promise<boolean> {
  return withRetry(async () => {
    const affected = await execute(
      'DELETE FROM wfh_applications WHERE application_id = $1',
      [id]
    )
    return affected > 0
  })
}

