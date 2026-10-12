# The Ruby half of the Ruby extractor. It reads Ruby source with Ripper and reports each constant
# reference with the lexical nesting it was written in, and nothing else: which file a constant
# lives in is a Zeitwerk question the TypeScript half answers. Ripper ships with every Ruby, so the
# extractor needs no gem.
#
# Usage: ruby references.rb <repo> < repo-relative paths, one per line
# Writes {"<path>": [{"nesting": [["A", "B"], ["A"]], "path": ["Foo"], "absolute": false}]}.

require "json"
require "ripper"

class ConstantReferences
  attr_reader :references

  def initialize(tree)
    @references = []
    visit(tree, [])
    @references.uniq!
  end

  private

  def visit(node, nesting)
    return unless node.is_a?(Array)

    case node.first
    when :module
      visit_declaration(node[1], nesting)
      visit(node[2], nested(nesting, node[1]))
    when :class
      visit_declaration(node[1], nesting)
      visit(node[2], nesting)
      visit(node[3], nested(nesting, node[1]))
    when :var_ref
      record(nesting, [node[1][1]], false) if constant?(node[1])
    when :top_const_ref
      record(nesting, [node[1][1]], true)
    when :const_path_ref
      path, absolute = static_path(node)
      if path
        record(nesting, path, absolute)
      else
        visit(node[1], nesting)
      end
    else
      node.each { |child| visit(child, nesting) }
    end
  end

  def constant?(token)
    token.is_a?(Array) && token.first == :@const
  end

  def record(nesting, path, absolute)
    @references << { "nesting" => nesting, "path" => path, "absolute" => absolute }
  end

  # `class Admin::RefundsController` looks `Admin` up before it opens the class, so every segment
  # of a declared name but the last is a reference made from the enclosing nesting.
  def visit_declaration(name, nesting)
    path, absolute = declared_path(name)
    if path.nil?
      visit(name, nesting)
    elsif path.length > 1
      record(nesting, path[0...-1], absolute)
    end
  end

  def declared_path(name)
    case name.first
    when :const_ref then [[name[1][1]], false]
    when :top_const_ref then [[name[1][1]], true]
    when :const_path_ref then static_path(name)
    end
  end

  def static_path(node)
    left = node[1]
    name = node[2][1]
    case left.first
    when :var_ref then constant?(left[1]) ? [[left[1][1], name], false] : nil
    when :top_const_ref then [[left[1][1], name], true]
    when :const_path_ref
      path, absolute = static_path(left)
      path && [path + [name], absolute]
    end
  end

  # Ruby searches the name a class or module keyword opened, and not the namespaces its compact
  # name passed through, so `class Admin::RefundsController` adds one entry and not two.
  def nested(nesting, name)
    path, absolute = declared_path(name)
    return nesting if path.nil?

    opened = absolute ? path : (nesting.first || []) + path
    [opened] + nesting
  end
end

repo = ARGV.fetch(0) { abort("usage: ruby references.rb <repo> < paths") }
found = {}
$stdin.each_line(chomp: true) do |path|
  next if path.empty?

  source = File.binread(File.join(repo, path)).force_encoding(Encoding::UTF_8).scrub
  tree = Ripper.sexp(source, path)
  abort("#{path} could not be read as Ruby") if tree.nil?

  found[path] = ConstantReferences.new(tree).references
end
$stdout.write(JSON.generate(found))
