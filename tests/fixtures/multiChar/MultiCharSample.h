/**
 * @copyright   New Technology System Co., Ltd. 2024
 * @author      New Technology System
 * @file        MultiCharSample.h
 * @brief "MyStep" has multi-character names
 * @todo
 */
#ifndef MultiCharSample_H
#define MultiCharSample_H

/**
 * <pre>
 *    CATPathElementAgent * curPathAgent = ...;
 *    if (curPathAgent)
 *    {
 *      // create explicit local undo step
 *      CATCommandGlobalUndo * GlobalUndo = new CATCommandGlobalUndo;
 *      if (GlobalUndo)
 *      {
 *        add_sample(GlobalUndo,”MyStep”);
 *        GlobalUndo -> Release(); GlobalUndo = NULL;
 *      }
 *      // value curPathAgent
 *      curPathAgent -> SetValue(...);
 *      curPathAgent -> SetValuation();
 *    }
 * </pre>
 */
void add_sample(CATCommandGlobalUndo *iUndoObject,
                const CATUnicodeString &iUndoTitle,
                CATDlgEngBehavior iUndoBehavior = CATDlgEngWithUndoStep);

#endif
