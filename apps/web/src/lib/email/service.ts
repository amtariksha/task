/**
 * Email Service
 * Handles sending emails with proper error handling and logging
 */

import nodemailer from 'nodemailer'
import { EMAIL_CONFIG, EmailType, EmailPriority } from './config'
import { workItemSubject, type WorkItemType } from '../workItemType'
import { brandingForCompany } from './branding'
import {
  getUserCredentialsHtmlTemplate,
  getTaskCreationHtmlTemplate,
  getLeaveStatusHtmlTemplate,
  getSupportAssignmentHtmlTemplate,
  getBugAssignmentHtmlTemplate,
  getBugCreationHtmlTemplate,
  getGeneralNotificationHtmlTemplate
} from './htmlTemplates'

// Email service class
export class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null

  constructor() {
    this.initializationPromise = this.initialize()
  }

  private async initialize() {
    // Log-once guard to avoid noisy logs on repeated inits (serverless cold starts)
    const logOnce = (() => {
      let logged = false
      return (msg: any, ...rest: any[]) => {
        if (!logged) {
          logged = true
          console.error(msg, ...rest)
        }
      }
    })()

    try {
      console.log('🔄 Initializing email service...')

      if (!EMAIL_CONFIG.features.enabled) {
        console.log('📧 Email service disabled by configuration')
        this.isInitialized = true
        return
      }

      if (!EMAIL_CONFIG.smtp.auth.user || !EMAIL_CONFIG.smtp.auth.pass) {
        console.warn('⚠️ Email credentials not configured. Email service will run in test mode.')
        EMAIL_CONFIG.features.testMode = true
        this.isInitialized = true
        return
      }

      this.transporter = nodemailer.createTransport({
        host: EMAIL_CONFIG.smtp.host,
        port: EMAIL_CONFIG.smtp.port,
        secure: EMAIL_CONFIG.smtp.secure,
        auth: {
          user: EMAIL_CONFIG.smtp.auth.user,
          pass: EMAIL_CONFIG.smtp.auth.pass,
        },
      })

      // Verify connection with a short timeout. On failure, fall back to test mode.
      if (!EMAIL_CONFIG.features.testMode) {
        try {
          await Promise.race([
            this.transporter.verify(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('SMTP verify timeout')), 2000)),
          ])
          console.log('✅ Email service initialized successfully')
        } catch (verifyErr: any) {
          logOnce('⚠️ Email verify failed. Falling back to test mode:', verifyErr?.message || verifyErr)
          EMAIL_CONFIG.features.testMode = true
          // Keep transporter null so sendEmail uses test mode path
          this.transporter = null
        }
      } else {
        console.log('✅ Email service initialized in test mode')
      }

      this.isInitialized = true
    } catch (error) {
      logOnce('❌ Failed to initialize email service (non-blocking):', error)
      // Do not block app. Switch to test mode and mark as initialized.
      EMAIL_CONFIG.features.testMode = true
      this.transporter = null
      this.isInitialized = true
    }
  }

  // Ensure initialization is complete
  private async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise
    }
  }

  public async sendEmail(options: {
    to: string | string[]
    cc?: string | string[]
    subject: string
    html: string
    priority?: EmailPriority
    type: EmailType
  }) {
    try {
      if (!EMAIL_CONFIG.features.enabled) {
        console.log('📧 Email sending disabled')
        return { success: false, message: 'Email service disabled' }
      }

      // Map our priority to nodemailer priority
      const nodemailerPriority = (options.priority === 'urgent' ? 'high' : options.priority) as 'high' | 'normal' | 'low' | undefined

      const mailOptions = {
        from: `${EMAIL_CONFIG.from.name} <${EMAIL_CONFIG.from.email}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        subject: options.subject,
        html: options.html,
        priority: nodemailerPriority || 'normal',
        headers: {
          'X-Email-Type': options.type,
          'X-Mailer': 'Karmayog',
        },
      }

      if (EMAIL_CONFIG.features.testMode || !this.transporter) {
        console.log('📧 [TEST MODE] Email would be sent:', {
          to: mailOptions.to,
          cc: mailOptions.cc,
          subject: mailOptions.subject,
          type: options.type,
        })
        return { success: true, message: 'Email sent (test mode)', messageId: 'test-' + Date.now() }
      }

      const result = await this.transporter.sendMail(mailOptions)
      
      if (EMAIL_CONFIG.features.debugMode) {
        console.log('📧 Email sent successfully:', {
          messageId: result.messageId,
          to: mailOptions.to,
          subject: mailOptions.subject,
        })
      }

      return { success: true, message: 'Email sent successfully', messageId: result.messageId }
    } catch (error) {
      console.error('❌ Failed to send email:', error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // Send task creation notification
  async sendTaskCreatedEmail(data: {
    creatorName: string
    creatorEmail: string
    managerEmail?: string
    taskTitle: string
    taskDescription: string
    priority: string
    dueDate: string
    assignedTo: string
    taskId: string
  }) {
    const html = getTaskCreationHtmlTemplate({
      userName: data.creatorName,
      taskTitle: data.taskTitle,
      taskDescription: data.taskDescription,
      priority: data.priority,
      dueDate: data.dueDate,
      assignedTo: data.assignedTo,
      taskId: data.taskId,
      createdBy: data.creatorName,
      baseUrl: EMAIL_CONFIG.templates.baseUrl,
    })

    const ccEmails = []
    if (data.managerEmail) ccEmails.push(data.managerEmail)

    return await this.sendEmail({
      to: data.creatorEmail,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `✅ Task Created: ${data.taskTitle}`,
      html,
      priority: data.priority.toLowerCase() === 'high' ? 'high' : 'normal',
      type: 'task_created',
    })
  }

  // Send task assignment notification (when someone assigns a task to another person)
  async sendTaskAssignedEmail(data: {
    assigneeName: string
    assigneeEmail: string
    taskTitle: string
    taskDescription: string
    priority: string
    dueDate: string
    assignedBy: string
    taskId: string
  }) {
    try {
      console.log('📧 Ensuring email service is initialized...')
      await this.ensureInitialized()

      console.log('📧 Generating task assignment email template...')
      const html = getTaskCreationHtmlTemplate({
        userName: data.assigneeName,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription,
        priority: data.priority,
        dueDate: data.dueDate,
        assignedTo: data.assigneeName,
        taskId: data.taskId,
        createdBy: data.assignedBy,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
      })

      console.log('📧 Sending task assignment email...')
      return await this.sendEmail({
        to: data.assigneeEmail,
        subject: `📋 New Task Assigned: ${data.taskTitle}`,
        html,
        priority: data.priority.toLowerCase().includes('u&i') ? 'high' : 'normal',
        type: 'task_created',
      })
    } catch (error) {
      console.error('❌ Failed to send task assignment email:', error)
      return { success: false, message: `Failed to send task assignment email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  // Send leave approval/rejection notification
  async sendLeaveStatusEmail(data: {
    userEmail: string
    userName: string
    leaveType: string
    startDate: string
    endDate: string
    days: number
    status: 'approved' | 'rejected'
    reason?: string
    approvedBy: string
    comments?: string
  }) {
    const html = getLeaveStatusHtmlTemplate({
      ...data,
      baseUrl: EMAIL_CONFIG.templates.baseUrl,
    })
    const statusText = data.status === 'approved' ? 'Approved' : 'Rejected'
    const statusIcon = data.status === 'approved' ? '✅' : '❌'

    return await this.sendEmail({
      to: data.userEmail,
      subject: `${statusIcon} Leave Application ${statusText}: ${data.leaveType}`,
      html,
      priority: 'normal',
      type: data.status === 'approved' ? 'leave_approved' : 'leave_rejected',
    })
  }

  // Send user credentials email
  async sendUserCredentialsEmail(data: {
    userEmail: string
    userName: string
    employeeId: string
    temporaryPassword: string
    department: string
    role: string
    manager?: string
    /** Company the user is joining; falls back to the platform brand. */
    companyId?: string | null
  }) {
    try {
      console.log('📧 Ensuring email service is initialized...')
      await this.ensureInitialized()

      // brandingForCompany existed but had no callers, so every company's new
      // users were welcomed in the platform's name.
      const branding = await brandingForCompany(data.companyId)

      console.log('📧 Generating user credentials email template...')
      const html = getUserCredentialsHtmlTemplate({
        userName: data.userName,
        userEmail: data.userEmail,
        employeeId: data.employeeId,
        temporaryPassword: data.temporaryPassword,
        department: data.department,
        role: data.role,
        manager: data.manager,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
        companyName: branding.companyName,
        logoUrl: branding.logoUrl,
      })

      console.log('📧 Sending user credentials email...')
      return await this.sendEmail({
        to: data.userEmail,
        subject: `🔐 Welcome to ${branding.companyName} - Your Account Details`,
        html,
        priority: 'high',
        type: 'user_credentials',
      })
    } catch (error) {
      console.error('❌ Failed to send credentials email:', error)
      return { success: false, message: `Failed to send credentials email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  // Send WFH approval/rejection notification (similar to leave)
  async sendWFHStatusEmail(data: {
    userEmail: string
    userName: string
    wfhDate: string
    status: 'approved' | 'rejected'
    reason?: string
    approvedBy: string
    comments?: string
  }) {
    // Reuse leave template with WFH-specific data
    const html = getLeaveStatusHtmlTemplate({
      userName: data.userName,
      leaveType: 'Work From Home',
      startDate: data.wfhDate,
      endDate: data.wfhDate,
      days: 1,
      status: data.status,
      reason: data.reason,
      approvedBy: data.approvedBy,
      comments: data.comments,
      baseUrl: EMAIL_CONFIG.templates.baseUrl,
    })

    const statusText = data.status === 'approved' ? 'Approved' : 'Rejected'
    const statusIcon = data.status === 'approved' ? '✅' : '❌'

    return await this.sendEmail({
      to: data.userEmail,
      subject: `${statusIcon} Work From Home Request ${statusText}: ${data.wfhDate}`,
      html,
      priority: 'normal',
      type: data.status === 'approved' ? 'wfh_approved' : 'wfh_rejected',
    })
  }

  /**
   * Send Support Assignment Email
   *
   * Sends email to support team member when they are assigned to help with a task.
   * This notifies them of their support task and provides details about the main task.
   *
   * @param data - Support assignment details including member info, task details, and IDs
   * @returns Promise with email sending result
   *
   * @example
   * await emailService.sendSupportAssignedEmail({
   *   supportMemberEmail: 'developer@example.com',
   *   supportMemberName: 'John Doe',
   *   mainTaskId: 'JSR-123',
   *   mainTaskDescription: 'Implement new feature',
   *   priority: 'U&I',
   *   dueDate: '2025-12-31',
   *   assignedBy: 'Jane Manager',
   *   supportTaskId: 'JSR-124'
   * })
   */
  async sendSupportAssignedEmail(data: {
    supportMemberEmail: string
    supportMemberName: string
    mainTaskId: string
    mainTaskDescription: string
    priority: string
    dueDate: string
    assignedBy: string
    supportTaskId: string
  }) {
    try {
      console.log('📧 Ensuring email service is initialized...')
      await this.ensureInitialized()

      console.log('📧 Generating support assignment email template...')
      const html = getSupportAssignmentHtmlTemplate({
        supportMemberName: data.supportMemberName,
        mainTaskId: data.mainTaskId,
        mainTaskDescription: data.mainTaskDescription,
        priority: data.priority,
        dueDate: data.dueDate,
        assignedBy: data.assignedBy,
        supportTaskId: data.supportTaskId,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
      })

      console.log('📧 Sending support assignment email...')
      return await this.sendEmail({
        to: data.supportMemberEmail,
        subject: `🤝 You've been assigned as support for task ${data.mainTaskId}`,
        html,
        priority: 'normal',
        type: 'task_created', // Reusing task_created type for now
      })
    } catch (error) {
      console.error('❌ Failed to send support assignment email:', error)
      return { success: false, message: `Failed to send support assignment email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  /**
   * Send Bug Assignment Email
   *
   * Sends email to developer when a bug is assigned to them.
   * Includes bug details, severity, priority, and link to bug page.
   *
   * @param data - Bug assignment details including assignee, bug info, and metadata
   * @returns Promise with email sending result
   *
   * @example
   * await emailService.sendBugAssignedEmail({
   *   assigneeEmail: 'developer@example.com',
   *   assigneeName: 'John Doe',
   *   assignedByEmail: 'manager@example.com',
   *   assignedByName: 'Jane Manager',
   *   bugId: 'BUG-123',
   *   bugTitle: 'Login button not working',
   *   bugDescription: 'Button does not respond to clicks',
   *   severity: 'Critical',
   *   priority: 'High',
   *   category: 'UI',
   *   platform: 'Web',
   *   environment: 'Production'
   * })
   */
  async sendBugAssignedEmail(data: {
    assigneeEmail: string
    assigneeName: string
    assignedByEmail?: string
    assignedByName: string
    bugId: string
    bugTitle: string
    bugDescription: string
    severity: string
    priority: string
    category: string
    platform: string
    environment: string
    /** 'feature' | 'bug' | 'other' | 'release'. Drives the subject wording. */
    type?: WorkItemType
  }) {
    try {
      console.log('📧 Ensuring email service is initialized...')
      await this.ensureInitialized()

      console.log('📧 Generating bug assignment email template...')
      const html = getBugAssignmentHtmlTemplate({
        assigneeName: data.assigneeName,
        assignedByName: data.assignedByName,
        bugId: data.bugId,
        bugTitle: data.bugTitle,
        bugDescription: data.bugDescription,
        severity: data.severity,
        priority: data.priority,
        category: data.category,
        platform: data.platform,
        environment: data.environment,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
      })

      console.log('📧 Sending bug assignment email...')

      // Prepare CC list (include person who assigned the bug)
      const ccEmails = []
      if (data.assignedByEmail) ccEmails.push(data.assignedByEmail)

      return await this.sendEmail({
        to: data.assigneeEmail,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject: workItemSubject(data.type, 'Assigned', data.bugTitle, data.bugId),
        html,
        priority: 'high', // Bug assignments are high priority
        type: 'task_created', // Reusing task_created type for now
      })
    } catch (error) {
      console.error('❌ Failed to send bug assignment email:', error)
      return { success: false, message: `Failed to send bug assignment email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  /**
   * Send Bug Creation Email
   *
   * Sends confirmation email to bug reporter when a new bug is created.
   * Also notifies the assigned developer if bug is assigned during creation.
   *
   * @param data - Bug creation details including reporter, bug info, and optional assignee
   * @returns Promise with email sending result
   *
   * @example
   * await emailService.sendBugCreatedEmail({
   *   reporterEmail: 'reporter@example.com',
   *   reporterName: 'John Doe',
   *   assigneeEmail: 'developer@example.com',
   *   bugId: 'BUG-123',
   *   bugTitle: 'Login button not working',
   *   bugDescription: 'Button does not respond to clicks',
   *   status: 'New',
   *   severity: 'Critical',
   *   priority: 'High',
   *   category: 'UI',
   *   platform: 'Web',
   *   environment: 'Production'
   * })
   */
  async sendBugCreatedEmail(data: {
    reporterEmail: string
    reporterName: string
    assigneeEmail?: string
    bugId: string
    bugTitle: string
    bugDescription: string
    status: string
    severity: string
    priority: string
    category: string
    platform: string
    environment: string
    /** 'feature' | 'bug' | 'other' | 'release'. Drives the subject wording. */
    type?: WorkItemType
  }) {
    try {
      console.log('📧 Ensuring email service is initialized...')
      await this.ensureInitialized()

      console.log('📧 Generating bug creation email template...')
      const html = getBugCreationHtmlTemplate({
        reporterName: data.reporterName,
        bugId: data.bugId,
        bugTitle: data.bugTitle,
        bugDescription: data.bugDescription,
        status: data.status,
        severity: data.severity,
        priority: data.priority,
        category: data.category,
        platform: data.platform,
        environment: data.environment,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
      })

      console.log('📧 Sending bug creation email...')

      // Prepare CC list (include assignee if bug is assigned during creation)
      const ccEmails = []
      if (data.assigneeEmail) ccEmails.push(data.assigneeEmail)

      return await this.sendEmail({
        to: data.reporterEmail,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject: workItemSubject(data.type, 'Created', data.bugTitle, data.bugId),
        html,
        priority: 'normal',
        type: 'task_created', // Reusing task_created type for now
      })
    } catch (error) {
      console.error('❌ Failed to send bug creation email:', error)
      return { success: false, message: `Failed to send bug creation email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  /**
   * Send General Notification Email
   *
   * Sends a styled general-purpose professional notification email.
   *
   * @param data - General notification details
   * @returns Promise with email sending result
   */
  async sendGeneralNotificationEmail(data: {
    userEmail: string
    userName: string
    actorName: string
    notificationTitle: string
    notificationMessage?: string
    actionUrl: string
    actionText?: string
    priority?: EmailPriority
    type: EmailType
  }) {
    try {
      await this.ensureInitialized()
      const html = getGeneralNotificationHtmlTemplate({
        userName: data.userName,
        actorName: data.actorName,
        notificationTitle: data.notificationTitle,
        notificationMessage: data.notificationMessage,
        actionUrl: data.actionUrl,
        actionText: data.actionText,
        baseUrl: EMAIL_CONFIG.templates.baseUrl,
      })

      return await this.sendEmail({
        to: data.userEmail,
        subject: `🔔 Notification: ${data.notificationTitle}`,
        html,
        priority: data.priority || 'normal',
        type: data.type,
      })
    } catch (error) {
      console.error('❌ Failed to send general notification email:', error)
      return { success: false, message: `Failed to send general notification email: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  // Check if email service is available
  isAvailable(): boolean {
    return EMAIL_CONFIG.features.enabled && (this.isInitialized || EMAIL_CONFIG.features.testMode)
  }

  // Async version that waits for initialization
  async isAvailableAsync(): Promise<boolean> {
    await this.ensureInitialized()
    return this.isAvailable()
  }

  // Get service status
  getStatus() {
    return {
      enabled: EMAIL_CONFIG.features.enabled,
      testMode: EMAIL_CONFIG.features.testMode,
      initialized: this.isInitialized,
      available: this.isAvailable(),
    }
  }
}

// Create singleton instance
export const emailService = new EmailService()

// Export types for use in other files
export type { EmailType, EmailPriority }
