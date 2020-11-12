/*
Copyright 2019 Intel Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;
var EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
var HEAP_ZERO_MEMORY = 0x00000008;

var duplex = require('stream').Duplex;

function vt()
{
    this._ObjectID = 'win-virtual-terminal';
    Object.defineProperty(this, 'supported', {
        value: (function ()
        {
            var gm = require('_GenericMarshal');
            var k32 = gm.CreateNativeProxy('kernel32.dll');
            try
            {
                k32.CreateMethod('CreatePseudoConsole');
            }
            catch(e)
            {
                return (false);
            }
            return (true);
        })()
    });
    this.Create = function Create(path, width, height)
    {
        if (!this.supported) { throw ('This build of Windows does not have support for PseudoConsoles'); }
        if (!width) { width = 80; }
        if (!height) { height = 25; }

        var GM = require('_GenericMarshal');
        var k32 = GM.CreateNativeProxy('kernel32.dll');
        k32.CreateMethod('CancelIoEx');
        k32.CreateMethod('CreatePipe');
        k32.CreateMethod('CreateProcessW');
        k32.CreateMethod('CreatePseudoConsole');
        k32.CreateMethod('CloseHandle');
        k32.CreateMethod('ClosePseudoConsole');
        k32.CreateMethod('GetProcessHeap');
        k32.CreateMethod('HeapAlloc');
        k32.CreateMethod('InitializeProcThreadAttributeList');
        k32.CreateMethod('ResizePseudoConsole');
        k32.CreateMethod('UpdateProcThreadAttribute');
        k32.CreateMethod('WriteFile');
        k32.CreateMethod('ReadFile');
        k32.CreateMethod('TerminateProcess');

        var ret = { _h: GM.CreatePointer(), _consoleInput: GM.CreatePointer(), _consoleOutput: GM.CreatePointer(), _input: GM.CreatePointer(), _output: GM.CreatePointer(), k32: k32 };
        var attrSize = GM.CreateVariable(8);
        var attrList;
        var pi = GM.CreateVariable(GM.PointerSize == 4 ? 16 : 24);

        // Create the necessary pipes
        if (k32.CreatePipe(ret._consoleInput, ret._input, 0, 0).Val == 0) { console.log('PIPE/FAIL'); }
        if (k32.CreatePipe(ret._output, ret._consoleOutput, 0, 0).Val == 0) { console.log('PIPE/FAIL'); }


        if (k32.CreatePseudoConsole((height << 16) | width, ret._consoleInput.Deref(), ret._consoleOutput.Deref(), 0, ret._h).Val != 0)
        {
            throw ('Error calling CreatePseudoConsole()');
        }

        k32.InitializeProcThreadAttributeList(0, 1, 0, attrSize);
        attrList = GM.CreateVariable(attrSize.toBuffer().readUInt32LE());
        var startupinfoex = GM.CreateVariable(GM.PointerSize == 8 ? 112 : 72);
        startupinfoex.toBuffer().writeUInt32LE(GM.PointerSize == 8 ? 112 : 72, 0);
        attrList.pointerBuffer().copy(startupinfoex.Deref(GM.PointerSize == 8 ? 104 : 68, GM.PointerSize).toBuffer());

        if (k32.InitializeProcThreadAttributeList(attrList, 1, 0, attrSize).Val != 0)
        {
            if (k32.UpdateProcThreadAttribute(attrList, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, ret._h.Deref(), GM.PointerSize, 0, 0).Val != 0)
            {
                if (k32.CreateProcessW(0, GM.CreateVariable(path, { wide: true }), 0, 0, 1, EXTENDED_STARTUPINFO_PRESENT, 0, 0, startupinfoex, pi).Val != 0)
                {
                    ret._startupinfoex = startupinfoex;
                    ret._process = pi.Deref(0);
                    ret._pid = pi.Deref(GM.PointerSize == 4 ? 8 : 16, 4).toBuffer().readUInt32LE();
                    var ds = new duplex(
                    {
                        'write': function (chunk, flush)
                        {
                            var written = require('_GenericMarshal').CreateVariable(4);
                            this.terminal.k32.WriteFile(this.terminal._input.Deref(), require('_GenericMarshal').CreateVariable(chunk), chunk.length, written, 0);
                            flush();
                            return (true);
                        },
                        'final': function (flush)
                        {
                            if (this.terminal._process)
                            {
                                this.terminal._process = null;
                                k32.ClosePseudoConsole(this._obj._h.Deref());
                            }
                            flush();
                        }
                    });
                    ds._obj = ret;
                    ret._waiter = require('DescriptorEvents').addDescriptor(pi.Deref(0));
                    ret._waiter.ds = ds;
                    ret._waiter._obj = ret;
                    ret._waiter.on('signaled', function ()
                    {
                        k32.CancelIoEx(this._obj._output.Deref(), 0);

                        // Child process has exited
                        this.ds.push(null);

                        if (this._obj._process)
                        {
                            this._obj._process = null;
                            k32.ClosePseudoConsole(this._obj._h.Deref());
                        }
                       k32.CloseHandle(this._obj._input.Deref());
                       k32.CloseHandle(this._obj._output.Deref());

                       k32.CloseHandle(this._obj._consoleInput.Deref());
                       k32.CloseHandle(this._obj._consoleOutput.Deref());
                    });
                    ds.resizeTerminal = function (w, h)
                    {
                        console.setDestination(console.Destinations.LOGFILE);
                        console.log('resizeTerminal(' + w + ', ' + h + ')');
                        var hr;
                        if((hr=k32.ResizePseudoConsole(this._obj._h.Deref(),  (h << 16) | w).Val) != 0)
                        {
                            console.log('HResult=' + hr);
                            throw ('Resize returned HRESULT: ' + hr);
                        }
                        console.log('SUCCESS');
                    };

                    ds.terminal = ret;
                    ds._rpbuf = GM.CreateVariable(4096);
                    ds._rpbufRead = GM.CreateVariable(4);
                    ds.__read = function __read()
                    {
                        this._rp = this.terminal.k32.ReadFile.async(this.terminal._output.Deref(), this._rpbuf, this._rpbuf._size, this._rpbufRead, 0);                      
                        this._rp.then(function ()
                        {
                            var len = this.parent._rpbufRead.toBuffer().readUInt32LE();
                            if (len <= 0) { return; }

                            this.parent.push(this.parent._rpbuf.toBuffer().slice(0, len));
                            this.parent.__read();
                        });
                        this._rp.parent = this;
                    };
                    ds.__read();
                    return (ds);
                }
                else
                {
                }
            }

        }
        throw ('Internal Error');
    }
    this.PowerShellCapable = function ()
    {
        if (require('os').arch() == 'x64')
        {
            return (require('fs').existsSync(process.env['windir'] + '\\SysWow64\\WindowsPowerShell\\v1.0\\powershell.exe'));
        }
        else
        {
            return (require('fs').existsSync(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'));
        }
    }
    this.Start = function Start(CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT)
    {
        return (this.Create(process.env['windir'] + '\\System32\\cmd.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
    }
    this.StartPowerShell = function StartPowerShell(CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT)
    {
        if (require('os').arch() == 'x64')
        {
            return (this.Create(process.env['windir'] + '\\SysWow64\\WindowsPowerShell\\v1.0\\powershell.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
        }
        else
        {
            return (this.Create(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
        }
    }
}

if (process.platform == 'win32')
{
    module.exports = new vt();
}