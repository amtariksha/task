'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { User } from '@/lib/types'
import { getRoleDisplayName } from '@/lib/auth'
import {
  CreditCard,
  Download,
  Printer,
  QrCode,
  Building,
  Mail,
  Phone,
  Calendar,
  Shield,
  X
} from 'lucide-react'

interface IDCardProps {
  user: User
}

export default function IDCard({ user }: IDCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [companyName, setCompanyName] = useState('Karmayog')

  // The card is an identity document for the company the holder actually works
  // for, so it carries that company's name rather than the product's. Falls back
  // to the product name, which is what it always showed.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/companies', { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        const companies: Array<{ companyId: string; name: string; isDefault?: boolean }> = json?.data || []
        const mine =
          companies.find((c) => c.companyId === (user as { companyId?: string }).companyId) ||
          companies.find((c) => c.isDefault) ||
          companies[0]
        if (!cancelled && mine?.name) setCompanyName(mine.name)
      } catch {
        // Cosmetic: keep the fallback rather than blanking the card.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const generateQRData = () => {
    return `${companyName}-${user.employeeId}-${user.name}-${user.department}`
  }

  const handlePrint = () => {
    const printContent = document.getElementById('id-card-print')
    if (printContent) {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Employee ID Card - ${user.name}</title>
              <style>
                * { box-sizing: border-box; }
                body {
                  margin: 0;
                  padding: 20px;
                  font-family: Arial, sans-serif;
                  background: white;
                }
                .id-card-print {
                  width: 5.5in;
                  height: 3.5in;
                  border: 2px solid #e5e7eb;
                  border-radius: 24px;
                  background: white;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  margin: 0 auto;
                  overflow: hidden;
                  display: flex;
                }
                .orange-sidebar {
                  width: 0.75in;
                  background: linear-gradient(to bottom, #f97316, #ea580c);
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: space-between;
                  padding: 24px 0;
                }
                .qr-code-box {
                  width: 60px;
                  height: 60px;
                  background: white;
                  border-radius: 8px;
                  padding: 6px;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .qr-placeholder {
                  width: 100%;
                  height: 100%;
                  background: rgba(0,0,0,0.1);
                  border-radius: 4px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 8px;
                  color: #666;
                }
                .verified-badge {
                  color: white;
                  font-size: 9px;
                  margin-top: 6px;
                  display: flex;
                  align-items: center;
                  gap: 3px;
                }
                .content-area {
                  flex: 1;
                  padding: 32px;
                  display: flex;
                  flex-direction: column;
                }
                .company-header {
                  text-align: center;
                  margin-bottom: 24px;
                }
                .company-logo {
                  width: 48px;
                  height: 48px;
                  background: linear-gradient(to bottom right, #f97316, #ea580c);
                  border-radius: 50%;
                  margin: 0 auto 12px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
                }
                .company-name {
                  font-size: 20px;
                  font-weight: bold;
                  color: #111827;
                }
                .employee-section {
                  display: flex;
                  gap: 24px;
                  margin-bottom: 24px;
                }
                .photo-container {
                  flex-shrink: 0;
                }
                .employee-photo {
                  width: 100px;
                  height: 100px;
                  border-radius: 16px;
                  border: 3px solid #e5e7eb;
                  object-fit: cover;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .avatar-placeholder {
                  width: 100px;
                  height: 100px;
                  background: linear-gradient(to bottom right, #f97316, #ea580c);
                  border-radius: 16px;
                  border: 3px solid #e5e7eb;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 32px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .employee-info {
                  flex: 1;
                  padding-top: 6px;
                }
                .employee-name {
                  font-size: 24px;
                  font-weight: bold;
                  color: #111827;
                  margin-bottom: 6px;
                }
                .employee-role {
                  font-size: 14px;
                  color: #6b7280;
                  margin-bottom: 16px;
                }
                .details-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 12px;
                  font-size: 11px;
                }
                .detail-item {
                  display: flex;
                  flex-direction: column;
                }
                .detail-label {
                  color: #6b7280;
                  font-weight: 500;
                  margin-bottom: 2px;
                }
                .detail-value {
                  color: #111827;
                  font-weight: 600;
                }
                @media print {
                  body { margin: 0; padding: 0; }
                  .id-card-print { margin: 0; box-shadow: none; }
                }
              </style>
            </head>
            <body>
              ${printContent.innerHTML}
            </body>
          </html>
        `)
        printWindow.document.close()
        printWindow.print()
        printWindow.close()
      }
    }
  }

  const handleDownload = () => {
    // For now, we'll trigger print which can be saved as PDF
    // In a real implementation, you might want to use a library like html2canvas or jsPDF
    handlePrint()
  }

  return (
    <>
      {/* ID Card Button */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-primary text-black font-medium py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-md hover:shadow-lg"
      >
        <CreditCard className="h-5 w-5" />
        <span>View ID Card</span>
      </button>

      {/* ID Card Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-black">Employee ID Card</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Modern ID Card Preview - New Design */}
              <div className="flex justify-center mb-6">
                <div
                  id="id-card-print"
                  className="id-card-print w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gray-200"
                  style={{ aspectRatio: '16/9' }}
                >
                  <div className="flex h-full">
                    {/* Left Orange Sidebar */}
                    <div className="w-24 bg-gradient-to-b from-orange-500 to-orange-600 flex-shrink-0 flex flex-col items-center justify-between py-8">
                      {/* QR Code at bottom */}
                      <div className="flex-1"></div>
                      <div className="w-20 h-20 bg-white rounded-lg p-2 shadow-lg">
                        <div className="w-full h-full bg-black/10 rounded flex items-center justify-center">
                          <QrCode className="h-12 w-12 text-gray-700" />
                        </div>
                      </div>
                      <div className="mt-2 text-white text-xs flex items-center space-x-1">
                        <Shield className="h-3 w-3" />
                        <span>Verified</span>
                      </div>
                    </div>

                    {/* Right Content Area */}
                    <div className="flex-1 p-8 flex flex-col">
                      {/* Company Logo and Name */}
                      <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full mb-3 shadow-lg">
                          <Shield className="h-10 w-10 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">{companyName}</h3>
                      </div>

                      {/* Employee Photo and Name */}
                      <div className="flex items-start space-x-6 mb-6">
                        {/* Employee Photo */}
                        <div className="flex-shrink-0">
                          {user.idCardPhoto ? (
                            <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-gray-200 shadow-xl">
                              <Image
                                src={user.idCardPhoto}
                                alt={user.name}
                                width={128}
                                height={128}
                                className="object-cover w-full h-full"
                              />
                            </div>
                          ) : (
                            <div className="w-32 h-32 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center text-white font-bold text-4xl shadow-xl border-4 border-gray-200">
                              {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Employee Name and Role */}
                        <div className="flex-1 pt-2">
                          <h2 className="text-3xl font-bold text-gray-900 mb-2">{user.name}</h2>
                          <p className="text-lg text-gray-600 mb-4">{getRoleDisplayName(user.role)} - {user.department}</p>
                        </div>
                      </div>

                      {/* Employee Details Grid */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        <div>
                          <div className="text-gray-500 font-medium">Employee ID:</div>
                          <div className="text-gray-900 font-semibold">{user.employeeId}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 font-medium">Department</div>
                          <div className="text-gray-900 font-semibold">{user.department}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-gray-500 font-medium">Join Date:</div>
                          <div className="text-gray-900 font-semibold">{formatDate(user.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Employee Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-black mb-4">Employee Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Employee ID</div>
                      <div className="text-sm text-gray-600 font-mono">{user.employeeId}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Building className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Department</div>
                      <div className="text-sm text-gray-600">{user.department}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Email</div>
                      <div className="text-sm text-gray-600">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Phone</div>
                      <div className="text-sm text-gray-600">{user.phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Join Date</div>
                      <div className="text-sm text-gray-600">{formatDate(user.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-black">Role</div>
                      <div className="text-sm text-gray-600">{getRoleDisplayName(user.role)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handlePrint}
                  className="flex-1 bg-primary hover:bg-orange-500 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print ID Card</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download as PDF</span>
                </button>
              </div>

              {/* QR Code Info */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <QrCode className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-blue-900">QR Code Data</div>
                    <div className="text-xs text-blue-700 font-mono break-all">{generateQRData()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
