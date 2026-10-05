// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mainProjectsOf, subprojectsOf } from '../projectOptions.ts'

// What GET /api/projects?parentId=PRJ-001 actually returns: the server ignores
// parentId and answers with every active project the user can see.
const visible = [
  { projectId: 'PRJ-003', projectName: 'Karmayog', parentProjectId: null },
  { projectId: 'PRJ-001', projectName: 'Swarg', parentProjectId: null },
  { projectId: 'PRJ-012', projectName: 'Website', parentProjectId: 'PRJ-001' },
  { projectId: 'PRJ-010', projectName: 'Kitchen app', parentProjectId: 'PRJ-001' },
  { projectId: 'PRJ-011', projectName: 'Mobile', parentProjectId: 'PRJ-003' },
]

describe('mainProjectsOf', () => {
  test('keeps only top-level projects, ordered by id', () => {
    assert.deepEqual(
      mainProjectsOf(visible).map((p) => p.projectId),
      ['PRJ-001', 'PRJ-003']
    )
  })

  test('treats a missing parent the same as a null one', () => {
    assert.deepEqual(mainProjectsOf([{ projectId: 'PRJ-009', projectName: 'Solo' }]).map((p) => p.projectId), [
      'PRJ-009',
    ])
  })

  test('does not reorder the array it was given', () => {
    const input = [...visible]
    mainProjectsOf(input)
    assert.deepEqual(input, visible)
  })
})

describe('subprojectsOf', () => {
  test('keeps only the children of the chosen project, ordered by id', () => {
    assert.deepEqual(
      subprojectsOf(visible, 'PRJ-001').map((p) => p.projectId),
      ['PRJ-010', 'PRJ-012']
    )
  })

  test('never offers the parent itself or another project’s children', () => {
    const ids = subprojectsOf(visible, 'PRJ-003').map((p) => p.projectId)
    assert.deepEqual(ids, ['PRJ-011'])
  })

  test('a project with no children gives an empty list', () => {
    assert.deepEqual(subprojectsOf(visible, 'PRJ-012'), [])
  })
})
