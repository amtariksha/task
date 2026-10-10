import { NextRequest, NextResponse } from 'next/server'
import { TaskStatusService } from '@/lib/businessRules'

export async function POST(request: NextRequest) {
  try {
    console.log('Starting delayed tasks update...')
    
    // Update delayed tasks
    const result = await TaskStatusService.updateDelayedTasks()
    
    console.log(`Updated ${result.updated} tasks to delayed status`)
    
    return NextResponse.json({
      success: true,
      data: {
        updated: result.updated,
        tasks: result.tasks.map(task => ({
          taskId: task.taskId,
          description: task.description,
          endDate: task.endDate,
          previousStatus: task.previousStatus,
          newStatus: 'Delayed'
        }))
      },
      message: `Successfully updated ${result.updated} tasks to delayed status`
    })
  } catch (error) {
    console.error('Failed to update delayed tasks:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update delayed tasks'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Get delayed tasks summary
    const summary = await TaskStatusService.getDelayedTasksSummary()
    
    return NextResponse.json({
      success: true,
      data: summary
    })
  } catch (error) {
    console.error('Failed to get delayed tasks summary:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get delayed tasks summary'
    }, { status: 500 })
  }
}
